import { useState, useEffect } from 'react'
import axios from 'axios'

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

interface DevinFixModalProps {
  isOpen: boolean
  onClose: () => void
  issue: Issue | null
  selectedRepo: string | null
  actionPlan?: string
}

interface DevinFixSession {
  session_id?: string
  status?: string
  status_enum?: string
  messages?: Array<{ message: string }>
  structured_output?: {
    confidence: number
    analysis_status: string
    implementation_status?: string
    progress_percentage?: number
    finished?: boolean
    PR_link?: string
  }
}

const API_BASE = 'http://localhost:3001/api'

export default function DevinFixModal({ isOpen, onClose, issue, selectedRepo, actionPlan }: DevinFixModalProps) {
  const [fixSession, setFixSession] = useState<DevinFixSession | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState<string>('Initializing fix session')
  const [currentPollingInterval, setCurrentPollingInterval] = useState<ReturnType<typeof setInterval> | null>(null)
  const [implementationStatus, setImplementationStatus] = useState<string>('Initializing')
  const [progressPercentage, setProgressPercentage] = useState<number>(0)
  const [prLink, setPrLink] = useState<string>('')
  const [finished, setFinished] = useState<boolean>(false)

  useEffect(() => {
    return () => {
      if (currentPollingInterval) {
        clearInterval(currentPollingInterval)
      }
    }
  }, [currentPollingInterval])

  useEffect(() => {
    if (isOpen && issue && selectedRepo) {
      startFixSession()
    }
    
    return () => {
      if (currentPollingInterval) {
        clearInterval(currentPollingInterval)
        setCurrentPollingInterval(null)
      }
    }
  }, [isOpen, issue, selectedRepo])

  const startFixSession = async () => {
    if (currentPollingInterval) {
      clearInterval(currentPollingInterval)
      setCurrentPollingInterval(null)
    }

    setIsLoading(true)
    setStatus('Starting Devin fix session')
    setFixSession(null)
    setSessionId(null)
    setImplementationStatus('Initializing')
    setProgressPercentage(0)
    setPrLink('')
    setFinished(false)

    try {
      const issueUrl = `https://github.com/${selectedRepo}/issues/${issue?.number}`
      
      const response = await axios.post(`${API_BASE}/devin/fix`, {
        issueUrl,
        issueText: issue?.body || '',
        actionPlan: actionPlan || 'No action plan provided'
      })

      const newSessionId = response.data.sessionId
      setSessionId(newSessionId)
      setStatus('Fix session created, starting implementation')
      
      startPollingFixSession(newSessionId)
    } catch (err: any) {
      console.error('Failed to create fix session:', err)
      setStatus('Failed to start fix session')
      setIsLoading(false)
    }
  }

  const startPollingFixSession = (sessionId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await axios.get(`${API_BASE}/devin/fix/${sessionId}`)
        const data = response.data
        
        setStatus(data.analysisStatus || data.status || 'Processing...')
        setFixSession(data.devinSession)
        setImplementationStatus(data.implementationStatus || 'Processing...')
        setProgressPercentage(data.progressPercentage || 0)
        setPrLink(data.prLink || '')
        setFinished(data.finished || false)
        
        if (data.isComplete || data.finished) {
          clearInterval(pollInterval)
          setCurrentPollingInterval(null)
          setIsLoading(false)
          setStatus(data.finished ? 'Implementation completed successfully' : 'Fix session completed')
        }
      } catch (err) {
        console.error('Polling error:', err)
      }
    }, 3000)

    setCurrentPollingInterval(pollInterval)

    setTimeout(() => {
      clearInterval(pollInterval)
      setCurrentPollingInterval(null)
      if (isLoading) {
        setIsLoading(false)
        setStatus('Fix session timeout - please try again')
      }
    }, 300000) // 5 minutes timeout
  }

  const handleClose = () => {
    if (currentPollingInterval) {
      clearInterval(currentPollingInterval)
      setCurrentPollingInterval(null)
    }
    
    setFixSession(null)
    setSessionId(null)
    setIsLoading(false)
    setStatus('Initializing fix session')
    setImplementationStatus('Initializing')
    setProgressPercentage(0)
    setPrLink('')
    setFinished(false)
    onClose()
  }

  if (!isOpen || !issue) return null

  return (
    <div className="devin-fix-modal-overlay" onClick={handleClose}>
      <div className="devin-fix-modal" onClick={(e) => e.stopPropagation()}>
        <div className="devin-fix-modal-header">
          <div className="devin-fix-modal-title">
            <span className="devin-icon">🔧</span>
            <h2>FIXING WITH DEVIN: {issue.title}</h2>
          </div>
          <button className="devin-fix-modal-close" onClick={handleClose}>
            ✕
          </button>
        </div>
        
        <div className="devin-fix-modal-content">
          {isLoading ? (
            <div className="devin-fix-loading">
              <div className="devin-fix-icon">🤖</div>
              <div className="devin-fix-title">
                Devin is working on your issue
              </div>
              {sessionId && (
                <div className="live-session-link">
                  <a 
                    href={`https://app.devin.ai/sessions/${sessionId.replace(/^devin-/, '')}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="live-session-button"
                  >
                    🔗 See LIVE session
                  </a>
                </div>
              )}
              <div className="devin-fix-status">
                {status}<span className="dots"></span>
              </div>
              
              {fixSession && (
                <div className="devin-fix-session-display">
                  <div className="fix-session-header">
                    <div className="fix-session-info">
                      <small>Session: {fixSession.session_id?.substring(6, 14) || 'Loading'}...</small>
                      <small>Status: {fixSession.status_enum || fixSession.status}</small>
                    </div>
                  </div>
                  
                  <div className="fix-structured-output">
                    <h4>Implementation Progress:</h4>
                    <div className="fix-progress-bar">
                      <div 
                        className="fix-progress-fill" 
                        style={{ width: `${progressPercentage}%` }}
                      ></div>
                      <span className="fix-progress-text">
                        {progressPercentage}%
                      </span>
                    </div>
                    <div className="fix-output-item">
                      <strong>Analysis:</strong> {status}
                    </div>
                    <div className="fix-output-item">
                      <strong>Implementation:</strong> {implementationStatus}
                    </div>
                    {prLink && (
                      <div className="fix-output-item">
                        <strong>Pull Request:</strong>{' '}
                        <a href={prLink} target="_blank" rel="noopener noreferrer" className="pr-link">
                          View PR ↗
                        </a>
                      </div>
                    )}
                  </div>
                  
                  {fixSession.messages && fixSession.messages.length > 0 && (
                    <div className="fix-messages-display">
                      <h4>Latest Update:</h4>
                      <div className="fix-latest-message">
                        {fixSession.messages[fixSession.messages.length - 1]?.message?.substring(0, 300)}
                        {fixSession.messages[fixSession.messages.length - 1]?.message?.length > 300 && '...'}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              <div className="devin-fix-progress">
                <div className="fix-progress-bar-animated"></div>
              </div>
            </div>
          ) : (
            <div className="devin-fix-completed">
              <div className="devin-fix-icon">{finished ? '🎉' : '✅'}</div>
              <div className="devin-fix-title">
                {finished ? 'Implementation Complete!' : 'Fix Session Completed'}
              </div>
              <div className="devin-fix-status">
                {status}
              </div>
              
              {progressPercentage > 0 && (
                <div className="fix-completion-progress">
                  <div className="fix-progress-bar">
                    <div 
                      className="fix-progress-fill" 
                      style={{ width: `${progressPercentage}%` }}
                    ></div>
                    <span className="fix-progress-text">
                      {progressPercentage}%
                    </span>
                  </div>
                </div>
              )}
              
              {prLink && (
                <div className="devin-fix-pr-section">
                  <h4>Pull Request Created</h4>
                  <a href={prLink} target="_blank" rel="noopener noreferrer" className="pr-link-button">
                    🔗 View Pull Request
                  </a>
                </div>
              )}
              
              {fixSession && fixSession.messages && fixSession.messages.length > 0 && (
                <div className="devin-fix-results">
                  <h4>Implementation Summary:</h4>
                  <div className="fix-results-content">
                    {fixSession.messages[fixSession.messages.length - 1]?.message}
                  </div>
                </div>
              )}
              
              <button className="devin-fix-close-button" onClick={handleClose}>
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}