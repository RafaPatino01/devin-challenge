import { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'
import DevinFixModal from './DevinFixModal'

interface Repository {
  id: number
  name: string
  full_name: string
  description: string
  issue_count: number
  updated_at: string
}

interface Issue {
  id: number
  number: number
  title: string
  state: 'open' | 'closed'
  labels: Array<{ name: string; color: string }>
  created_at: string
  body: string
  html_url?: string
}

type AppState = 'auth' | 'repos' | 'issues'

const API_BASE = 'http://localhost:3001/api'

function App() {
  const [state, setState] = useState<AppState>('auth')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Form data
  const [username, setUsername] = useState('')
  const [token, setToken] = useState('')
  
  // Data
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)
  const [issues, setIssues] = useState<Issue[]>([])
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false)
  const [confidenceScore, setConfidenceScore] = useState<{
    confidence: number;
    level: string;
    description: string;
  } | null>(null)
  const [isLoadingConfidence, setIsLoadingConfidence] = useState(false)
  const [devinSessionId, setDevinSessionId] = useState<string | null>(null)
  const [analysisStatus, setAnalysisStatus] = useState<string>('Starting issue assessment')
  const [devinSession, setDevinSession] = useState<any>(null)
  const [currentPollingInterval, setCurrentPollingInterval] = useState<ReturnType<typeof setInterval> | null>(null)
  const [, setSessionKey] = useState<string>('')
  const [isDevinFixModalOpen, setIsDevinFixModalOpen] = useState(false)
  const [isExplainPlanModalOpen, setIsExplainPlanModalOpen] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [isSubmittingExplanation, setIsSubmittingExplanation] = useState(false)

  // Cleanup polling on component unmount
  useEffect(() => {
    return () => {
      if (currentPollingInterval) {
        console.log('Cleaning up polling interval on component unmount')
        clearInterval(currentPollingInterval)
      }
    }
  }, [currentPollingInterval])

  const handleConnect = () => {
    setIsModalOpen(true)
    setError(null)
  }

  const handleSubmitAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !token.trim()) {
      setError('Please fill in all fields')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await axios.post(`${API_BASE}/github/configure`, {
        username: username.trim(),
        token: token.trim()
      })

      if (response.data.success) {
        setIsModalOpen(false)
        setState('repos')
        await fetchRepositories()
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to authenticate with GitHub')
    } finally {
      setLoading(false)
    }
  }

  const fetchRepositories = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await axios.get(`${API_BASE}/github/repos`)
      setRepositories(response.data)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch repositories')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectRepo = async (repo: Repository) => {
    setLoading(true)
    setError(null)

    try {
      await axios.post(`${API_BASE}/github/select-repo`, {
        repo: repo.full_name
      })
      
      setSelectedRepo(repo.full_name)
      setState('issues')
      await fetchIssues()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to select repository')
      setLoading(false)
    }
  }

  const fetchIssues = async () => {
    try {
      const response = await axios.get(`${API_BASE}/github/issues`)
      setIssues(response.data)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch issues')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const handleBackToRepos = () => {
    setState('repos')
    setSelectedRepo(null)
    setIssues([])
  }

  const fetchConfidenceScore = async (issue: Issue) => {
    // Always clean up any existing polling first
    if (currentPollingInterval) {
      console.log('Stopping previous polling session to start fresh')
      clearInterval(currentPollingInterval)
      setCurrentPollingInterval(null)
    }

    // Generate unique session key for this attempt
    const newSessionKey = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`
    console.log('Starting new session attempt:', newSessionKey)
    
    // Reset all state for fresh session
    setSessionKey(newSessionKey)
    setIsLoadingConfidence(true)
    setConfidenceScore(null)
    setAnalysisStatus('Starting issue assessment')
    setDevinSessionId(null)
    setDevinSession(null)
    
    try {
      // Create issue URL from selected repo and issue number
      const issueUrl = `https://github.com/${selectedRepo}/issues/${issue.number}`
      
      console.log('Creating NEW Devin session for issue:', issueUrl)
      
      // Create Devin session
      const response = await axios.post(`${API_BASE}/devin/confidence`, {
        issueUrl
      })
      
      const sessionId = response.data.sessionId
      console.log('NEW Devin session created:', sessionId)
      setDevinSessionId(sessionId)
      
      // Start polling for updates
      startPollingSession(sessionId)
    } catch (err: any) {
      console.error('Failed to create Devin session:', err)
      // Set a default score if session creation fails
      setConfidenceScore({
        confidence: 75,
        level: 'medium',
        description: 'Unable to connect to Devin - using fallback assessment'
      })
      setIsLoadingConfidence(false)
    }
  }

  const startPollingSession = (sessionId: string) => {
    console.log('Starting polling for session:', sessionId)
    
    const pollInterval = setInterval(async () => {
      try {
        console.log('Polling session:', sessionId)
        const response = await axios.get(`${API_BASE}/devin/confidence/${sessionId}`)
        const data = response.data
        
        console.log('Poll response:', { 
          confidence: data.confidence, 
          isComplete: data.isComplete, 
          analysisStatus: data.analysisStatus 
        })
        
        setAnalysisStatus(data.analysisStatus)
        setDevinSession(data.devinSession)
        
        // Update confidence if we have a valid score
        if (data.confidence > 0) {
          console.log('Setting confidence score:', data.confidence)
          const newConfidenceScore = {
            confidence: data.confidence,
            level: data.level,
            description: data.description
          }
          console.log('About to set confidence state:', newConfidenceScore)
          setConfidenceScore(newConfidenceScore)
          console.log('Confidence state should be updated now')
        }
        
        // Stop polling when complete
        if (data.isComplete) {
          console.log('Session complete, stopping polling')
          clearInterval(pollInterval)
          setCurrentPollingInterval(null)
          setIsLoadingConfidence(false)
        }
      } catch (err) {
        console.error('Polling error:', err)
        // Don't clear interval on errors, keep trying
      }
    }, 3000) // Poll every 3 seconds

    // Store the interval reference
    setCurrentPollingInterval(pollInterval)

    // Cleanup after 5 minutes to prevent infinite polling
    setTimeout(() => {
      console.log('Polling timeout reached')
      clearInterval(pollInterval)
      setCurrentPollingInterval(null)
      if (isLoadingConfidence) {
        setIsLoadingConfidence(false)
        setConfidenceScore({
          confidence: 60,
          level: 'medium',
          description: 'Assessment timeout - partial analysis completed'
        })
      }
    }, 300000) // 5 minutes timeout
  }

  const handleScopeWithDevin = (issue: Issue) => {
    setSelectedIssue(issue)
    setIsIssueModalOpen(true)
    // Always start fresh analysis for demo purposes
    console.log('Starting NEW analysis from Scope with Devin button')
    fetchConfidenceScore(issue)
  }

  const handleIssueClick = (issue: Issue) => {
    setSelectedIssue(issue)
    setIsIssueModalOpen(true)
    // Always start fresh analysis for demo purposes
    console.log('Starting NEW analysis from issue click')
    fetchConfidenceScore(issue)
  }

  const handleCloseIssueModal = () => {
    // Clean up polling when modal closes
    if (currentPollingInterval) {
      console.log('Cleaning up polling interval on modal close')
      clearInterval(currentPollingInterval)
      setCurrentPollingInterval(null)
    }
    
    console.log('Completely resetting all session state on modal close')
    setIsIssueModalOpen(false)
    setSelectedIssue(null)
    setConfidenceScore(null)
    setIsLoadingConfidence(false)
    setDevinSessionId(null)
    setAnalysisStatus('Starting issue assessment')
    setDevinSession(null)
    setSessionKey('')
  }

  const handleFixWithDevin = () => {
    console.log('Opening Devin Fix Modal for:', selectedIssue?.title)
    setIsIssueModalOpen(false) // Close the current modal
    setIsDevinFixModalOpen(true) // Open the new Devin fix modal
  }

  const handleCloseDevinFixModal = () => {
    setIsDevinFixModalOpen(false)
  }

  const handleExplainPlan = () => {
    console.log('Opening Explain Plan Modal for:', selectedIssue?.title)
    setIsExplainPlanModalOpen(true)
  }

  const handleCloseExplainPlanModal = () => {
    setIsExplainPlanModalOpen(false)
    setPhoneNumber('')
    setIsSubmittingExplanation(false)
  }

  const cleanWebhookData = (text: string): string => {
    return text.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
  }

  const handleSubmitExplanation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phoneNumber.trim() || !selectedIssue || !devinSession) {
      return
    }

    setIsSubmittingExplanation(true)

    try {
      const webhookData = {
        phone_number: cleanWebhookData(phoneNumber),
        issue_name: cleanWebhookData(selectedIssue.title),
        issue_description: cleanWebhookData(selectedIssue.body || 'No description provided'),
        devins_plan: cleanWebhookData(devinSession.messages?.[devinSession.messages.length - 1]?.message || 'No plan available')
      }

      const response = await fetch('https://hook.us1.make.com/fjciyiahsxaeu4r43p5vqsuqwwiyhz2b', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(webhookData)
      })

      if (response.ok) {
        alert('Explanation call request submitted successfully!')
        handleCloseExplainPlanModal()
      } else {
        throw new Error('Failed to submit request')
      }
    } catch (error) {
      console.error('Error submitting explanation request:', error)
      alert('Failed to submit explanation call request. Please try again.')
    } finally {
      setIsSubmittingExplanation(false)
    }
  }

  const renderAuth = () => (
    <div className="app-container">
      <h1>Devin Issue Solver</h1>
      <p>Connect your GitHub account to view and manage issues from your repositories</p>
      
      {error && <div className="error">{error}</div>}
      
      <button className="btn-primary" onClick={handleConnect}>
        Connect to GitHub
      </button>

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Connect to GitHub</h2>
            
            {error && <div className="error">{error}</div>}
            
            <form onSubmit={handleSubmitAuth}>
              <div className="form-group">
                <label className="form-label" htmlFor="username">
                  GitHub Username
                </label>
                <input
                  id="username"
                  type="text"
                  className="form-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your GitHub username"
                  disabled={loading}
                />
              </div>
              
              <div className="form-group">
                <label className="form-label" htmlFor="token">
                  Personal Access Token
                </label>
                <input
                  id="token"
                  type="password"
                  className="form-input"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Enter your GitHub personal access token"
                  disabled={loading}
                />
              </div>
              
              <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading}
                >
                  {loading ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )

  const renderRepositories = () => (
    <div className="app-container">
      <h1>Select Repository</h1>
      <p>Choose a repository to view its issues</p>
      
      {error && <div className="error">{error}</div>}
      
      {loading ? (
        <div className="loading">Loading repositories...</div>
      ) : (
        <>
          {repositories.map((repo) => (
            <div
              key={repo.id}
              className="card"
              onClick={() => handleSelectRepo(repo)}
            >
              <h3 className="card-title">{repo.name}</h3>
              {repo.description && (
                <p className="card-description">{repo.description}</p>
              )}
              <div className="card-meta">
                <span>{repo.issue_count} issues</span>
                <span>Updated {formatDate(repo.updated_at)}</span>
              </div>
            </div>
          ))}
          
          {repositories.length === 0 && (
            <p>No repositories found</p>
          )}
        </>
      )}
    </div>
  )

  const renderIssues = () => (
    <div className="app-container">
      <div style={{ marginBottom: '32px' }}>
        <button 
          className="github-link-button" 
          onClick={handleBackToRepos}
          style={{ 
            background: 'none', 
            border: 'none', 
            color: '#58a6ff', 
            fontSize: '14px', 
            cursor: 'pointer', 
            padding: '0', 
            textDecoration: 'none',
            marginBottom: '16px',
            display: 'block'
          }}
          onMouseEnter={(e) => (e.target as HTMLButtonElement).style.textDecoration = 'underline'}
          onMouseLeave={(e) => (e.target as HTMLButtonElement).style.textDecoration = 'none'}
        >
          ← Back to Repositories
        </button>
        <h1 style={{ margin: 0, fontSize: '30px', textAlign: 'left' }}>Issues: {selectedRepo}</h1>
      </div>
      
      {error && <div className="error">{error}</div>}
      
      {loading ? (
        <div className="loading">Loading issues...</div>
      ) : (
        <>
          {issues.map((issue) => (
            <div key={issue.id} className="card issue-card" onClick={() => handleIssueClick(issue)}>
              <div 
                className="devin-scope-tooltip" 
                onClick={(e) => {
                  e.stopPropagation(); // Prevent the main card click
                  handleScopeWithDevin(issue);
                }}
              >
                <img 
                  src="https://mintlify.s3.us-west-1.amazonaws.com/cognitionai/logo/devin.png" 
                  alt="Devin" 
                  className="devin-logo"
                />
                <span>Scope with DEVIN</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
                <span className={`issue-state-${issue.state}`}>
                  {issue.state === 'open' ? '●' : '●'}
                </span>
                <div style={{ flex: 1 }}>
                  <h3 className="card-title">
                    {issue.title} #{issue.number}
                  </h3>
                  
                  {issue.labels.length > 0 && (
                    <div className="issue-labels">
                      {issue.labels.map((label, index) => (
                        <span
                          key={index}
                          className="issue-label"
                          style={{ backgroundColor: `#${label.color}` }}
                        >
                          {label.name}
                        </span>
                      ))}
                    </div>
                  )}
                  
                  {issue.body && (
                    <p className="card-description">
                      {issue.body.length > 150 
                        ? `${issue.body.substring(0, 150)}...` 
                        : issue.body
                      }
                    </p>
                  )}
                  
                  <div className="card-meta">
                    <span>Created {formatDate(issue.created_at)}</span>
                    <span>{issue.state}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          
          {issues.length === 0 && (
            <div className="card">
              <p style={{ textAlign: 'center', margin: 0 }}>
                No issues found in this repository
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )

  const renderIssueModal = () => {
    if (!selectedIssue || !isIssueModalOpen) return null

    return (
      <div className="issue-modal-overlay" onClick={handleCloseIssueModal}>
        <div className="issue-modal" onClick={(e) => e.stopPropagation()}>
          <div className="issue-modal-header">
            <div className="issue-modal-title">
              <span className={`issue-state-${selectedIssue.state}`}>
                {selectedIssue.state === 'open' ? '●' : '●'}
              </span>
              <h2>{selectedIssue.title} #{selectedIssue.number}</h2>
            </div>
            <button className="issue-modal-close" onClick={handleCloseIssueModal}>
              ✕
            </button>
          </div>
          
          <div className="issue-modal-content">
            <div className="issue-modal-left">
              <div className="issue-meta">
                <div className="issue-meta-item">
                  <strong>Status:</strong> {selectedIssue.state}
                </div>
                <div className="issue-meta-item">
                  <strong>Created:</strong> {formatDate(selectedIssue.created_at)}
                </div>
                {selectedIssue.html_url && (
                  <div className="issue-meta-item">
                    <a href={selectedIssue.html_url} target="_blank" rel="noopener noreferrer" className="github-link">
                      View on GitHub ↗
                    </a>
                  </div>
                )}
              </div>

              {selectedIssue.labels.length > 0 && (
                <div className="issue-labels-section">
                  <h3>Labels</h3>
                  <div className="issue-labels">
                    {selectedIssue.labels.map((label, index) => (
                      <span
                        key={index}
                        className="issue-label"
                        style={{ backgroundColor: `#${label.color}` }}
                      >
                        {label.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="issue-description">
                <h3>Description</h3>
                <div className="issue-body">
                  {selectedIssue.body ? (
                    <pre className="issue-body-text">{selectedIssue.body}</pre>
                  ) : (
                    <p className="no-description">No description provided.</p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="issue-modal-right">
              {isLoadingConfidence ? (
                <div className="calculating-container">
                  <div className="calculating-icon">🤖</div>
                  <div className="calculating-title">
                    Devin Analysis in Progress
                  </div>
                  {devinSessionId && (
                    <div className="live-session-link">
                      <a 
                        href={`https://app.devin.ai/sessions/${devinSessionId.replace(/^devin-/, '')}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="live-session-button"
                      >
                        🔗 See LIVE session
                      </a>
                    </div>
                  )}
                  <div className="calculating-text">
                    {analysisStatus}<span className="dots"></span>
                  </div>
                  
                  {devinSession && (
                    <div className="devin-session-display">
                      <div className="session-header">
                        <div className="session-info">
                          <small>Session: {devinSession.session_id?.substring(6, 14) || 'Loading'}...</small>
                          <small>Status: {devinSession.status_enum || devinSession.status}</small>
                        </div>
                      </div>
                      
                      {devinSession.structured_output && (
                        <div className="structured-output">
                          <h4>Current Assessment:</h4>
                          <div className="output-item">
                            <strong>Confidence:</strong> {devinSession.structured_output.confidence}
                          </div>
                          <div className="output-item">
                            <strong>Status:</strong> {devinSession.structured_output.analysis_status}
                          </div>
                        </div>
                      )}
                      
                      {devinSession.messages && devinSession.messages.length > 1 && (
                        <div className="messages-display">
                          <h4>Latest Message:</h4>
                          <div className="latest-message">
                            {devinSession.messages[devinSession.messages.length - 1]?.message?.substring(0, 200)}
                            {devinSession.messages[devinSession.messages.length - 1]?.message?.length > 200 && '...'}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="calculating-progress">
                    <div className="progress-bar"></div>
                  </div>
                </div>
              ) : (
                <>
                  
                  {confidenceScore && (
                    <div className="confidence-score-card fade-in">
                      <div className="confidence-label">Devin Confidence Score</div>
                      <div className="confidence-percentage">{confidenceScore.confidence}%</div>
                      <div className="confidence-description">
                        {confidenceScore.description}
                      </div>
                    </div>
                  )}
                  
                  {confidenceScore && devinSession && devinSession.messages && devinSession.messages.length > 1 && (
                    <div className="implementation-plan fade-in-delayed">
                      <h3>DEVIN's Plan</h3>
                      <div className="plan-content">
                        {devinSession.messages[devinSession.messages.length - 1]?.message}
                      </div>
                    </div>
                  )}
                  
                  {confidenceScore && (
                    <div className="devin-section fade-in-delayed">
                      <h3>Devin AI Engineer</h3>
                      <p>Delegate this issue to Devin for autonomous resolution. Devin can handle bug fixes, code refactoring, and feature implementation with 8-12x efficiency gains.</p>
                      <button className="explain-plan-button" onClick={handleExplainPlan}>
                        📞 EXPLAIN PLAN
                      </button>
                      <button className="devin-button" onClick={handleFixWithDevin}>
                        <i className="bi bi-wrench-adjustable"></i>
                        FIX WITH DEVIN
                      </button>
                      <div className="devin-benefits">
                        <div className="benefit-item">✓ Autonomous task completion</div>
                        <div className="benefit-item">✓ 20x cost savings</div>
                        <div className="benefit-item">✓ Human review & approval</div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderExplainPlanModal = () => {
    if (!isExplainPlanModalOpen) return null

    return (
      <div className="explain-plan-modal-overlay" onClick={handleCloseExplainPlanModal}>
        <div className="explain-plan-modal" onClick={(e) => e.stopPropagation()}>
          <div className="explain-plan-modal-header">
            <div className="explain-plan-modal-title">
              <span className="explain-icon">📞</span>
              <h2>Request Explanation Call</h2>
            </div>
            <button className="explain-plan-modal-close" onClick={handleCloseExplainPlanModal}>
              ✕
            </button>
          </div>
          
          <div className="explain-plan-modal-content">
            <div className="explain-plan-info">
              <h3>Get a Personal Explanation</h3>
              <p>Receive a phone call explaining Devin's implementation plan for this issue in detail.</p>
            </div>
            
            <form onSubmit={handleSubmitExplanation}>
              <div className="form-group">
                <label className="form-label" htmlFor="phone">
                  Phone Number
                </label>
                <input
                  id="phone"
                  type="tel"
                  className="form-input"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="Enter your phone number"
                  disabled={isSubmittingExplanation}
                  required
                />
              </div>
              
              <div className="explain-plan-preview">
                <h4>Issue Details</h4>
                <div className="preview-item">
                  <strong>Issue:</strong> {selectedIssue?.title}
                </div>
                <div className="preview-item">
                  <strong>Description:</strong> {selectedIssue?.body ? (selectedIssue.body.length > 100 ? `${selectedIssue.body.substring(0, 100)}...` : selectedIssue.body) : 'No description provided'}
                </div>
                {devinSession?.messages?.[devinSession.messages.length - 1]?.message && (
                  <div className="preview-item">
                    <strong>Plan:</strong> {devinSession.messages[devinSession.messages.length - 1].message.length > 100 ? `${devinSession.messages[devinSession.messages.length - 1].message.substring(0, 100)}...` : devinSession.messages[devinSession.messages.length - 1].message}
                  </div>
                )}
              </div>
              
              <div className="explain-plan-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleCloseExplainPlanModal}
                  disabled={isSubmittingExplanation}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="explain-plan-submit-button"
                  disabled={isSubmittingExplanation || !phoneNumber.trim()}
                >
                  {isSubmittingExplanation ? 'Submitting...' : 'Request Call'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'auth') return (
    <>
      {renderAuth()}
      {renderIssueModal()}
      {renderExplainPlanModal()}
      <DevinFixModal
        isOpen={isDevinFixModalOpen}
        onClose={handleCloseDevinFixModal}
        issue={selectedIssue}
        selectedRepo={selectedRepo}
        actionPlan={devinSession?.messages?.[devinSession.messages.length - 1]?.message}
      />
    </>
  )
  if (state === 'repos') return (
    <>
      {renderRepositories()}
      {renderIssueModal()}
      {renderExplainPlanModal()}
      <DevinFixModal
        isOpen={isDevinFixModalOpen}
        onClose={handleCloseDevinFixModal}
        issue={selectedIssue}
        selectedRepo={selectedRepo}
        actionPlan={devinSession?.messages?.[devinSession.messages.length - 1]?.message}
      />
    </>
  )
  return (
    <>
      {renderIssues()}
      {renderIssueModal()}
      {renderExplainPlanModal()}
      <DevinFixModal
        isOpen={isDevinFixModalOpen}
        onClose={handleCloseDevinFixModal}
        issue={selectedIssue}
        selectedRepo={selectedRepo}
        actionPlan={devinSession?.messages?.[devinSession.messages.length - 1]?.message}
      />
    </>
  )
}

export default App
