import express from 'express';
import cors from 'cors';
import axios from 'axios';

// Logging utility
const logRequest = (req: express.Request, method: string, endpoint: string, additionalData?: any) => {
  const timestamp = new Date().toISOString();
  const requestId = Math.random().toString(36).substring(7);
  console.log(`\n🌐 [${timestamp}] [${requestId}] ${method} ${endpoint}`);
  console.log(`📍 [${requestId}] IP: ${req.ip || req.connection.remoteAddress || 'unknown'}`);
  console.log(`🔗 [${requestId}] User-Agent: ${req.get('User-Agent') || 'unknown'}`);
  if (req.body && Object.keys(req.body).length > 0) {
    const sanitizedBody = { ...req.body };
    if (sanitizedBody.token) sanitizedBody.token = '[REDACTED]';
    if (sanitizedBody.password) sanitizedBody.password = '[REDACTED]';
    console.log(`📦 [${requestId}] Body:`, sanitizedBody);
  }
  if (req.query && Object.keys(req.query).length > 0) {
    console.log(`🔍 [${requestId}] Query:`, req.query);
  }
  if (additionalData) {
    console.log(`📊 [${requestId}] Additional:`, additionalData);
  }
  return requestId;
};

const logResponse = (requestId: string, statusCode: number, responseData?: any, error?: any) => {
  const timestamp = new Date().toISOString();
  if (error) {
    console.log(`❌ [${timestamp}] [${requestId}] ERROR ${statusCode}:`, error.message || error);
    if (error.response?.data) {
      console.log(`📄 [${requestId}] Error details:`, error.response.data);
    }
  } else {
    console.log(`✅ [${timestamp}] [${requestId}] SUCCESS ${statusCode}`);
    if (responseData && typeof responseData === 'object') {
      if (Array.isArray(responseData)) {
        console.log(`📋 [${requestId}] Response: Array with ${responseData.length} items`);
      } else {
        const keys = Object.keys(responseData);
        console.log(`📋 [${requestId}] Response keys: [${keys.join(', ')}]`);
      }
    }
  }
};

const logExternalRequest = (url: string, method: string = 'GET', data?: any) => {
  const timestamp = new Date().toISOString();
  const requestId = Math.random().toString(36).substring(7);
  console.log(`\n🌍 [${timestamp}] [${requestId}] External ${method}: ${url}`);
  if (data) {
    const sanitizedData = { ...data };
    if (typeof sanitizedData === 'object') {
      Object.keys(sanitizedData).forEach(key => {
        if (key.toLowerCase().includes('token') || key.toLowerCase().includes('key') || key.toLowerCase().includes('auth')) {
          sanitizedData[key] = '[REDACTED]';
        }
      });
    }
    console.log(`📤 [${requestId}] Request data:`, sanitizedData);
  }
  return requestId;
};

const logExternalResponse = (requestId: string, status?: number, error?: any, responseSize?: number) => {
  const timestamp = new Date().toISOString();
  if (error) {
    console.log(`❌ [${timestamp}] [${requestId}] External request failed:`, error.message);
    if (error.response) {
      console.log(`📄 [${requestId}] Status: ${error.response.status}, Data:`, error.response.data);
    }
  } else {
    console.log(`✅ [${timestamp}] [${requestId}] External request success: ${status || 'unknown'}`);
    if (responseSize) {
      console.log(`📊 [${requestId}] Response size: ${responseSize} bytes`);
    }
  }
};

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

// Devin API configuration
const DEVIN_API_KEY = process.env.DEVIN_API_KEY;
const DEVIN_API_BASE = process.env.DEVIN_API_BASE || 'https://api.devin.ai/v1';

if (!DEVIN_API_KEY) {
  console.error('❌ Error: DEVIN_API_KEY is not set in the environment variables');
  process.exit(1);
}

const app = express();

app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  // Store request ID for potential use in route handlers
  (req as any).requestId = requestId;
  
  console.log(`\n🌐 [${new Date().toISOString()}] [${requestId}] ${req.method} ${req.path}`);
  console.log(`📍 [${requestId}] IP: ${req.ip || req.connection.remoteAddress || 'unknown'}`);
  console.log(`🔗 [${requestId}] User-Agent: ${req.get('User-Agent') || 'unknown'}`);
  
  // Override res.json to log response time
  const originalJson = res.json;
  res.json = function(data) {
    const duration = Date.now() - startTime;
    console.log(`⏱️ [${requestId}] Response sent in ${duration}ms`);
    return originalJson.call(this, data);
  };
  
  next();
});

// In-memory storage for GitHub credentials and selected repo
interface GitHubConfig {
  username: string;
  token: string;
  selectedRepo?: string;
}

let githubConfig: GitHubConfig | null = null;

// In-memory storage for Devin sessions (in production, use Redis or database)
interface DevinSession {
  sessionId: string;
  issueUrl: string;
  status: string;
  confidence: string;
  analysisStatus: string;
  createdAt: Date;
  type?: 'confidence' | 'fix'; // New field to distinguish session types
  issueText?: string; // For fix sessions
  actionPlan?: string; // For fix sessions
}

const devinSessions = new Map<string, DevinSession>();

// Configure GitHub credentials
app.post('/api/github/configure', async (req, res) => {
  const requestId = logRequest(req, 'POST', '/api/github/configure', { username: req.body.username });
  const { username, token } = req.body;

  if (!username || !token) {
    const error = 'Username and token are required';
    console.log(`❌ [${requestId}] Validation failed: ${error}`);
    logResponse(requestId, 400, null, new Error(error));
    return res.status(400).json({ error });
  }

  console.log(`🔐 [${requestId}] Validating GitHub credentials for user: ${username}`);

  try {
    const extRequestId = logExternalRequest('https://api.github.com/user', 'GET');
    const response = await axios.get('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'Cognition-Challenge-App'
      }
    });
    logExternalResponse(extRequestId, response.status);

    console.log(`🔍 [${requestId}] GitHub API returned user: ${response.data.login}`);

    if (response.data.login.toLowerCase() !== username.toLowerCase()) {
      const error = `Username mismatch: provided '${username}', token belongs to '${response.data.login}'`;
      console.log(`❌ [${requestId}] ${error}`);
      logResponse(requestId, 400, null, new Error(error));
      return res.status(400).json({ error: 'Username does not match token' });
    }

    githubConfig = { username, token };
    console.log(`✅ [${requestId}] GitHub credentials configured successfully for ${username}`);
    const responseData = { success: true, message: 'GitHub credentials configured successfully' };
    logResponse(requestId, 200, responseData);
    res.json(responseData);
  } catch (error: any) {
    console.log(`❌ [${requestId}] GitHub credential validation failed:`, error.response?.status || error.message);
    logResponse(requestId, 401, null, error);
    res.status(401).json({ error: 'Invalid GitHub credentials' });
  }
});

// Get user repositories
app.get('/api/github/repos', async (req, res) => {
  const requestId = logRequest(req, 'GET', '/api/github/repos');
  
  if (!githubConfig) {
    const error = 'GitHub not configured';
    console.log(`❌ [${requestId}] ${error}`);
    logResponse(requestId, 401, null, new Error(error));
    return res.status(401).json({ error });
  }

  console.log(`📂 [${requestId}] Fetching repositories for user: ${githubConfig.username}`);

  try {
    const extRequestId = logExternalRequest('https://api.github.com/user/repos', 'GET', { sort: 'updated', per_page: 30 });
    const response = await axios.get(`https://api.github.com/user/repos`, {
      headers: {
        'Authorization': `token ${githubConfig.token}`,
        'User-Agent': 'Cognition-Challenge-App'
      },
      params: {
        sort: 'updated',
        per_page: 30
      }
    });
    logExternalResponse(extRequestId, response.status, null, JSON.stringify(response.data).length);

    console.log(`📊 [${requestId}] Found ${response.data.length} repositories, fetching issue counts...`);

    // Get issue counts for each repo
    const reposWithIssues = await Promise.all(
      response.data.map(async (repo: any, index: number) => {
        console.log(`🔍 [${requestId}] Processing repo ${index + 1}/${response.data.length}: ${repo.full_name}`);
        try {
          const issueExtRequestId = logExternalRequest(`https://api.github.com/search/issues`, 'GET', { q: `repo:${repo.full_name} type:issue` });
          const issuesResponse = await axios.get(`https://api.github.com/search/issues`, {
            headers: {
              'Authorization': `token ${githubConfig!.token}`,
              'User-Agent': 'Cognition-Challenge-App'
            },
            params: { 
              q: `repo:${repo.full_name} type:issue`,
              per_page: 1
            }
          });
          logExternalResponse(issueExtRequestId, issuesResponse.status);
          
          const issueCount = issuesResponse.data.total_count;
          console.log(`📋 [${requestId}] Repo ${repo.full_name}: ${issueCount} issues`);

          return {
            id: repo.id,
            name: repo.name,
            full_name: repo.full_name,
            description: repo.description,
            issue_count: issueCount,
            updated_at: repo.updated_at
          };
        } catch (issueError: any) {
          console.log(`⚠️ [${requestId}] Failed to fetch issues for ${repo.full_name}:`, issueError.message);
          return {
            id: repo.id,
            name: repo.name,
            full_name: repo.full_name,
            description: repo.description,
            issue_count: 0,
            updated_at: repo.updated_at
          };
        }
      })
    );

    console.log(`✅ [${requestId}] Successfully processed all repositories with issue counts`);
    logResponse(requestId, 200, reposWithIssues);
    res.json(reposWithIssues);
  } catch (error: any) {
    console.log(`❌ [${requestId}] Failed to fetch repositories:`, error.response?.status || error.message);
    logResponse(requestId, 500, null, error);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

// Select repository
app.post('/api/github/select-repo', (req, res) => {
  const requestId = logRequest(req, 'POST', '/api/github/select-repo', { repo: req.body.repo });
  const { repo } = req.body;

  if (!githubConfig) {
    const error = 'GitHub not configured';
    console.log(`❌ [${requestId}] ${error}`);
    logResponse(requestId, 401, null, new Error(error));
    return res.status(401).json({ error });
  }

  if (!repo) {
    const error = 'Repository is required';
    console.log(`❌ [${requestId}] ${error}`);
    logResponse(requestId, 400, null, new Error(error));
    return res.status(400).json({ error });
  }

  const previousRepo = githubConfig.selectedRepo;
  githubConfig.selectedRepo = repo;
  console.log(`🔄 [${requestId}] Repository selection changed: '${previousRepo}' -> '${repo}'`);
  
  const responseData = { success: true, message: 'Repository selected successfully' };
  logResponse(requestId, 200, responseData);
  res.json(responseData);
});

// Get issues from selected repository
app.get('/api/github/issues', async (req, res) => {
  const requestId = logRequest(req, 'GET', '/api/github/issues');
  
  if (!githubConfig || !githubConfig.selectedRepo) {
    const error = 'GitHub not configured or no repository selected';
    console.log(`❌ [${requestId}] ${error}`);
    logResponse(requestId, 401, null, new Error(error));
    return res.status(401).json({ error });
  }

  console.log(`📋 [${requestId}] Fetching issues from repository: ${githubConfig.selectedRepo}`);

  try {
    const extRequestId = logExternalRequest(`https://api.github.com/repos/${githubConfig.selectedRepo}/issues`, 'GET', { state: 'all', per_page: 50 });
    const response = await axios.get(`https://api.github.com/repos/${githubConfig.selectedRepo}/issues`, {
      headers: {
        'Authorization': `token ${githubConfig.token}`,
        'User-Agent': 'Cognition-Challenge-App'
      },
      params: {
        state: 'all',
        per_page: 50
      }
    });
    logExternalResponse(extRequestId, response.status, null, JSON.stringify(response.data).length);

    // Filter out pull requests - only keep actual issues
    let issues = response.data.filter((item: any) => !item.pull_request);
    console.log(`🔍 [${requestId}] Found ${response.data.length} total items, ${issues.length} actual issues (filtered out pull requests)`);
    
    if (issues.length === 0) {
      console.log(`📝 [${requestId}] No real issues found, using fallback demo issues`);
      issues = [
        {
          id: 1,
          number: 1,
          title: "Add task completion toggle functionality",
          state: "open",
          labels: [
            { name: "enhancement", color: "a2eeef" },
            { name: "frontend", color: "7057ff" }
          ],
          created_at: "2025-01-15T10:30:00Z",
          body: "Implement the ability to mark tasks as completed with a toggle button"
        },
        {
          id: 2,
          number: 2,
          title: "Fix responsive layout on mobile devices",
          state: "open",
          labels: [
            { name: "bug", color: "d73a49" },
            { name: "ui", color: "0075ca" }
          ],
          created_at: "2025-01-16T14:20:00Z",
          body: "The todo list doesn't display properly on small screens"
        },
        {
          id: 3,
          number: 3,
          title: "Add task persistence with localStorage",
          state: "closed",
          labels: [
            { name: "enhancement", color: "a2eeef" },
            { name: "backend", color: "5319e7" }
          ],
          created_at: "2025-01-14T09:15:00Z",
          body: "Tasks should persist between browser sessions"
        }
      ];
      console.log(`🎭 [${requestId}] Using ${issues.length} demo issues as fallback`);
    }

    // Format issues for consistent structure
    const formattedIssues = issues.map((issue: any) => ({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      state: issue.state,
      labels: issue.labels || [],
      created_at: issue.created_at,
      body: issue.body || '',
      html_url: issue.html_url
    }));

    console.log(`✅ [${requestId}] Successfully formatted ${formattedIssues.length} issues for response`);
    logResponse(requestId, 200, formattedIssues);
    res.json(formattedIssues);
  } catch (error: any) {
    console.log(`❌ [${requestId}] Failed to fetch issues:`, error.response?.status || error.message);
    logResponse(requestId, 500, null, error);
    res.status(500).json({ error: 'Failed to fetch issues' });
  }
});

// Create Devin session for confidence assessment
app.post('/api/devin/confidence', async (req, res) => {
  const requestId = logRequest(req, 'POST', '/api/devin/confidence', { issueUrl: req.body.issueUrl });
  const { issueUrl } = req.body;
  
  console.log(`🚀 [${requestId}] Creating Devin session for issue analysis: ${issueUrl}`);

  if (!issueUrl) {
    const error = 'Issue URL is required';
    console.log(`❌ [${requestId}] Validation failed: ${error}`);
    logResponse(requestId, 400, null, new Error(error));
    return res.status(400).json({ error });
  }

  console.log(`📝 [${requestId}] Preparing assessment-only prompt for Devin API`);
  console.log(`🎯 [${requestId}] Current Devin sessions in memory: ${devinSessions.size}`);

  try {
    // Create Devin session with assessment-only prompt
    const prompt = `**ASSESSMENT ONLY - DO NOT IMPLEMENT**

Analyze this GitHub issue and provide implementation confidence: ${issueUrl}

Your task ends after you:
1. Read the issue
2. Examine the code
3. Create the plan  
4. Assign confidence score

**STOP IMMEDIATELY AFTER PROVIDING THE PLAN. DO NOT START IMPLEMENTATION.**
**DO NOT CREATE PULL REQUESTS OR EDIT ANY CODE.**

I only need the confidence assessment, not the actual fix.

Please update the structured output immediately whenever you change your confidence level or complete analysis steps:
{
  "confidence": "unknown",
  "analysis_status": "Starting issue assessment"
}

Confidence levels: unknown, low, medium, high, very_high

 TRY DOING IT AS QUICKLY AS POSSIBLE, as few steps as possible, THIS IS A DEMO AND SHOULD NOT TAKE TOO LONG!!! Help me just reading the files and comming up with an answer

 **REMEMBER: STOP after the plan. Do not implement anything.**`;

    console.log(`📤 [${requestId}] Prompt length: ${prompt.length} characters`);
    
    const sessionData = {
      prompt,
      idempotent: false, // Always create new session for demo purposes
      session_visibility: 'private'
    };
    
    const extRequestId = logExternalRequest(`${DEVIN_API_BASE}/sessions`, 'POST', { ...sessionData, prompt: '[TRUNCATED]' });
    console.log(`🔐 [${requestId}] Using API key: ${DEVIN_API_KEY.substring(0, 20)}...`);
    
    const response = await axios.post(`${DEVIN_API_BASE}/sessions`, sessionData, {
      headers: {
        'Authorization': `Bearer ${DEVIN_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    logExternalResponse(extRequestId, response.status, null, JSON.stringify(response.data).length);

    const sessionId = response.data.session_id;
    console.log(`✅ [${requestId}] Devin session created successfully: ${sessionId}`);
    console.log(`🔗 [${requestId}] Session URL: ${response.data.url || 'N/A'}`);
    console.log(`📊 [${requestId}] Session data keys: [${Object.keys(response.data).join(', ')}]`);
    
    // Store session for tracking
    const sessionRecord = {
      sessionId,
      issueUrl,
      status: 'running',
      confidence: 'unknown',
      analysisStatus: 'Starting issue assessment',
      createdAt: new Date(),
      type: 'confidence' as const
    };
    
    devinSessions.set(sessionId, sessionRecord);
    console.log(`💾 [${requestId}] Session stored in memory. Total active sessions: ${devinSessions.size}`);

    const responseData = {
      sessionId,
      status: 'running',
      confidence: 'unknown',
      analysisStatus: 'Starting issue assessment'
    };
    
    logResponse(requestId, 200, responseData);
    res.json(responseData);
  } catch (error: any) {
    console.log(`❌ [${requestId}] Failed to create Devin session:`, error.response?.data || error.message);
    if (error.response) {
      console.log(`📄 [${requestId}] Response status: ${error.response.status}`);
      console.log(`📄 [${requestId}] Response headers:`, Object.keys(error.response.headers || {}));
      if (error.response.data) {
        console.log(`📄 [${requestId}] Response data:`, error.response.data);
      }
    }
    logResponse(requestId, 500, null, error);
    res.status(500).json({ error: 'Failed to create Devin session' });
  }
});

// Poll Devin session status
app.get('/api/devin/confidence/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const requestId = logRequest(req, 'GET', `/api/devin/confidence/${sessionId}`, { sessionId });
  
  console.log(`🔍 [${requestId}] Polling Devin session: ${sessionId}`);
  
  if (!devinSessions.has(sessionId)) {
    const error = `Session ${sessionId} not found in memory`;
    console.log(`❌ [${requestId}] ${error}`);
    console.log(`🗂️ [${requestId}] Available sessions: [${Array.from(devinSessions.keys()).join(', ')}]`);
    logResponse(requestId, 404, null, new Error(error));
    return res.status(404).json({ error: 'Session not found' });
  }

  const storedSession = devinSessions.get(sessionId)!;
  console.log(`📊 [${requestId}] Stored session data: status=${storedSession.status}, confidence=${storedSession.confidence}, created=${storedSession.createdAt.toISOString()}`);

  try {
    const extRequestId = logExternalRequest(`${DEVIN_API_BASE}/session/${sessionId}`, 'GET');
    const response = await axios.get(`${DEVIN_API_BASE}/session/${sessionId}`, {
      headers: {
        'Authorization': `Bearer ${DEVIN_API_KEY}`
      }
    });
    logExternalResponse(extRequestId, response.status, null, JSON.stringify(response.data).length);

    const sessionData = response.data;
    console.log(`📡 [${requestId}] Devin API response - status: ${sessionData.status}, status_enum: ${sessionData.status_enum}`);
    console.log(`🏷️ [${requestId}] Session title: ${sessionData.title || 'N/A'}`);
    console.log(`📅 [${requestId}] Last updated: ${sessionData.updated_at || 'N/A'}`);
    
    // Debug: Log the entire structured_output if it exists
    console.log(`🔍 [${requestId}] Raw structured_output exists:`, !!sessionData.structured_output);
    console.log(`🔍 [${requestId}] Raw structured_output:`, JSON.stringify(sessionData.structured_output, null, 2));
    
    let confidence = 'unknown';
    let analysisStatus = 'Starting issue assessment';
    let isComplete = false;

    // Extract confidence from both structured_output AND messages (more robust approach)
    let foundConfidenceInStructuredOutput = false;
    let foundConfidenceInMessages = false;
    
    // First: Try structured_output
    if (sessionData.structured_output && typeof sessionData.structured_output === 'object' && sessionData.structured_output !== null) {
      console.log(`🎯 [${requestId}] Found structured output:`, sessionData.structured_output);
      if (sessionData.structured_output.confidence) {
        confidence = sessionData.structured_output.confidence;
        foundConfidenceInStructuredOutput = true;
      }
      if (sessionData.structured_output.analysis_status) {
        analysisStatus = sessionData.structured_output.analysis_status;
      }
      console.log(`🔍 [${requestId}] From structured_output - confidence: ${confidence}, analysisStatus: ${analysisStatus}`);
    }
    
    // Second: Also check messages (regardless of structured_output success)
    if (sessionData.messages && Array.isArray(sessionData.messages) && sessionData.messages.length > 0) {
      console.log(`🔍 [${requestId}] Checking ${sessionData.messages.length} messages for confidence`);
      
      // Check all messages, not just the last one
      for (let i = sessionData.messages.length - 1; i >= 0; i--) {
        const message = sessionData.messages[i];
        if (message && message.message) {
          console.log(`🔍 [${requestId}] Checking message ${i}:`, message.message.substring(0, 150));
          
          // Look for JSON patterns in the message
          const jsonMatches = message.message.match(/\{[^}]*"confidence":\s*"([^"]+)"[^}]*\}/g);
          if (jsonMatches) {
            for (const jsonMatch of jsonMatches) {
              try {
                const parsedJson = JSON.parse(jsonMatch);
                if (parsedJson.confidence && (!foundConfidenceInStructuredOutput || confidence === 'unknown')) {
                  confidence = parsedJson.confidence;
                  foundConfidenceInMessages = true;
                  console.log(`📊 [${requestId}] Found confidence in message JSON: ${confidence}`);
                }
                if (parsedJson.analysis_status) {
                  analysisStatus = parsedJson.analysis_status;
                  console.log(`📊 [${requestId}] Found analysis_status in message JSON: ${analysisStatus}`);
                }
              } catch (e) {
                // Ignore JSON parse errors, continue checking
              }
            }
          }
          
          // Also look for simple regex patterns
          const confidenceMatch = message.message.match(/confidence['":\s]*['"]*([a-z_]+)['"]/i);
          if (confidenceMatch && !foundConfidenceInStructuredOutput && !foundConfidenceInMessages) {
            const foundConf = confidenceMatch[1].toLowerCase();
            if (['unknown', 'low', 'medium', 'high', 'very_high'].includes(foundConf)) {
              confidence = foundConf;
              foundConfidenceInMessages = true;
              console.log(`📊 [${requestId}] Found confidence via regex: ${confidence}`);
            }
          }
          
          if (foundConfidenceInMessages && confidence !== 'unknown') break;
        }
      }
    }
    
    console.log(`📊 [${requestId}] Final confidence sources - structured_output: ${foundConfidenceInStructuredOutput}, messages: ${foundConfidenceInMessages}, final: ${confidence}`);

    // Check if session is complete (blocked means stopped after assessment)
    if (sessionData.status_enum === 'blocked' || sessionData.status === 'completed') {
      isComplete = true;
      console.log(`✅ [${requestId}] Session is complete (status_enum: ${sessionData.status_enum})`);
      if (analysisStatus === 'Starting issue assessment') {
        analysisStatus = 'Assessment complete';
        console.log(`🔄 [${requestId}] Updated analysis status to: ${analysisStatus}`);
      }
    } else {
      console.log(`⏳ [${requestId}] Session still running (status_enum: ${sessionData.status_enum})`);
    }

    // Update stored session
    storedSession.status = sessionData.status;
    storedSession.confidence = confidence;
    storedSession.analysisStatus = analysisStatus;
    console.log(`💾 [${requestId}] Updated stored session data`);

    // Log message count if available
    if (sessionData.messages && Array.isArray(sessionData.messages)) {
      console.log(`💬 [${requestId}] Session has ${sessionData.messages.length} messages`);
    }

    // Convert confidence to percentage for frontend compatibility
    let confidencePercentage = 0;
    switch (confidence) {
      case 'very_high': confidencePercentage = 95; break;
      case 'high': confidencePercentage = 88; break;
      case 'medium': confidencePercentage = 70; break;
      case 'low': confidencePercentage = 50; break;
      default: 
        console.log(`⚠️ [${requestId}] Unknown confidence level: "${confidence}"`);
        confidencePercentage = 0;
    }
    console.log(`📊 [${requestId}] Confidence mapping: "${confidence}" -> ${confidencePercentage}%`);

    let description = 'Calculating confidence level';
    if (isComplete) {
      // Use Devin's actual analysis status when available
      if (sessionData.structured_output?.analysis_status) {
        description = sessionData.structured_output.analysis_status;
        console.log(`📝 [${requestId}] Using Devin's analysis status: ${description}`);
      } else {
        // Fallback descriptions based on confidence
        switch (confidence) {
          case 'very_high':
            description = 'Excellent confidence for autonomous code migration and bug resolution';
            break;
          case 'high':
            description = 'High confidence - straightforward implementation with clear solution path';
            break;
          case 'medium':
            description = 'Good confidence for structured development tasks';
            break;
          case 'low':
            description = 'Moderate confidence - may require additional context';
            break;
          default:
            description = 'Assessment completed - confidence level determined';
        }
        console.log(`📝 [${requestId}] Using fallback description: ${description}`);
      }
      
      // If confidence is still unknown but we're complete, set a default confidence for display
      if (confidence === 'unknown') {
        console.log(`⚠️ [${requestId}] Session complete but confidence unknown, defaulting to medium for display`);
        confidence = 'medium'; // Default to medium so frontend shows something
      }
    } else {
      console.log(`⏳ [${requestId}] Session not complete, using default description`);
    }

    const responseData = {
      sessionId,
      status: sessionData.status,
      confidence: confidencePercentage,
      level: confidence,
      description,
      analysisStatus,
      isComplete,
      // Raw Devin session data for display
      devinSession: {
        session_id: sessionData.session_id,
        status: sessionData.status,
        title: sessionData.title,
        created_at: sessionData.created_at,
        updated_at: sessionData.updated_at,
        status_enum: sessionData.status_enum,
        structured_output: sessionData.structured_output,
        messages: sessionData.messages || []
      }
    };

    console.log(`✅ [${requestId}] Polling successful - confidence: ${confidence} (${confidencePercentage}%), complete: ${isComplete}`);
    logResponse(requestId, 200, { ...responseData, devinSession: { messageCount: responseData.devinSession.messages.length } });
    res.json(responseData);
  } catch (error: any) {
    console.log(`❌ [${requestId}] Failed to poll Devin session:`, error.response?.data || error.message);
    if (error.response) {
      console.log(`📄 [${requestId}] Poll error status: ${error.response.status}`);
      if (error.response.data) {
        console.log(`📄 [${requestId}] Poll error data:`, error.response.data);
      }
    }
    logResponse(requestId, 500, null, error);
    res.status(500).json({ error: 'Failed to poll session status' });
  }
});

// Create Devin session for fix implementation
app.post('/api/devin/fix', async (req, res) => {
  const requestId = logRequest(req, 'POST', '/api/devin/fix', { issueUrl: req.body.issueUrl });
  const { issueUrl, issueText, actionPlan } = req.body;
  
  console.log(`🔧 [${requestId}] Creating Devin fix session for issue: ${issueUrl}`);

  if (!issueUrl) {
    const error = 'Issue URL is required';
    console.log(`❌ [${requestId}] Validation failed: ${error}`);
    logResponse(requestId, 400, null, new Error(error));
    return res.status(400).json({ error });
  }

  console.log(`📝 [${requestId}] Preparing fix implementation prompt for Devin API`);
  console.log(`🎯 [${requestId}] Current Devin sessions in memory: ${devinSessions.size}`);

  try {
    // Create Devin session with fix implementation prompt
    const prompt = `**IMPLEMENT FIX FOR GITHUB ISSUE**

Fix this GitHub issue by implementing the solution: ${issueUrl}

Issue Details:
${issueText || 'No additional issue text provided'}

Action Plan (from previous analysis):
${actionPlan || 'No action plan provided - please analyze the issue and create your own implementation plan'}

**IMPLEMENTATION REQUIREMENTS:**
1. Analyze the issue and repository structure
2. Implement the necessary code changes
3. Create a pull request with the fix
4. Ensure all tests pass
5. Follow the repository's coding standards


**IMPORTANT: Please update the structured output throughout your implementation process:**
YOU SHOULD SEND AT LEAST some updates before finishing, with the updated structured output so that we know how everything is going!!!! This is very important
{
  "confidence": "unknown",
  "analysis_status": "Starting implementation",
  "implementation_status": "Initializing",
  "progress_percentage": 0,
  "finished": false,
  "PR_link": ""
}

Progress stages:
- analysis_status: "Starting implementation" → "Analyzing issue" → "Planning solution" → "Implementation complete"
- implementation_status: "Initializing" → "Setting up environment" → "Making code changes" → "Creating tests" → "Creating PR" → "Complete"
- progress_percentage: 0 → 25 → 50 → 75 → 100
- finished: false → true (when complete)
- PR_link: "" → actual pull request URL when created

**Proceed with full implementation and create a pull request.**

PLEASE I NEED YOU TO NOT USE THE BROWSER FOR THIS FIX, DO NOT TEST THE SOLUTION JUST PROVIDE THE UPDATED CODE, TRY DOING IT AS QUICKLY AS POSSIBLE, THIS IS A DEMO AND SHOULD NOT TAKE TOO LONG!!!
`;

    console.log(`📤 [${requestId}] Fix prompt length: ${prompt.length} characters`);
    
    const sessionData = {
      prompt,
      idempotent: false,
      session_visibility: 'private'
    };
    
    const extRequestId = logExternalRequest(`${DEVIN_API_BASE}/sessions`, 'POST', { ...sessionData, prompt: '[TRUNCATED]' });
    console.log(`🔐 [${requestId}] Using API key: ${DEVIN_API_KEY.substring(0, 20)}...`);
    
    const response = await axios.post(`${DEVIN_API_BASE}/sessions`, sessionData, {
      headers: {
        'Authorization': `Bearer ${DEVIN_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    logExternalResponse(extRequestId, response.status, null, JSON.stringify(response.data).length);

    const sessionId = response.data.session_id;
    console.log(`✅ [${requestId}] Devin fix session created successfully: ${sessionId}`);
    console.log(`🔗 [${requestId}] Session URL: ${response.data.url || 'N/A'}`);
    
    // Store session for tracking
    const sessionRecord = {
      sessionId,
      issueUrl,
      status: 'running',
      confidence: 'unknown',
      analysisStatus: 'Starting implementation',
      createdAt: new Date(),
      type: 'fix' as const,
      issueText,
      actionPlan
    };
    
    devinSessions.set(sessionId, sessionRecord);
    console.log(`💾 [${requestId}] Fix session stored in memory. Total active sessions: ${devinSessions.size}`);

    const responseData = {
      sessionId,
      status: 'running',
      analysisStatus: 'Starting implementation'
    };
    
    logResponse(requestId, 200, responseData);
    res.json(responseData);
  } catch (error: any) {
    console.log(`❌ [${requestId}] Failed to create Devin fix session:`, error.response?.data || error.message);
    if (error.response) {
      console.log(`📄 [${requestId}] Response status: ${error.response.status}`);
      if (error.response.data) {
        console.log(`📄 [${requestId}] Response data:`, error.response.data);
      }
    }
    logResponse(requestId, 500, null, error);
    res.status(500).json({ error: 'Failed to create Devin fix session' });
  }
});

// Poll Devin fix session status
app.get('/api/devin/fix/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const requestId = logRequest(req, 'GET', `/api/devin/fix/${sessionId}`, { sessionId });
  
  console.log(`🔍 [${requestId}] Polling Devin fix session: ${sessionId}`);
  
  if (!devinSessions.has(sessionId)) {
    const error = `Fix session ${sessionId} not found in memory`;
    console.log(`❌ [${requestId}] ${error}`);
    console.log(`🗂️ [${requestId}] Available sessions: [${Array.from(devinSessions.keys()).join(', ')}]`);
    logResponse(requestId, 404, null, new Error(error));
    return res.status(404).json({ error: 'Session not found' });
  }

  const storedSession = devinSessions.get(sessionId)!;
  
  // Verify this is a fix session
  if (storedSession.type !== 'fix') {
    const error = `Session ${sessionId} is not a fix session (type: ${storedSession.type})`;
    console.log(`❌ [${requestId}] ${error}`);
    logResponse(requestId, 400, null, new Error(error));
    return res.status(400).json({ error: 'Invalid session type' });
  }
  
  console.log(`📊 [${requestId}] Stored fix session data: status=${storedSession.status}, created=${storedSession.createdAt.toISOString()}`);

  try {
    const extRequestId = logExternalRequest(`${DEVIN_API_BASE}/session/${sessionId}`, 'GET');
    const response = await axios.get(`${DEVIN_API_BASE}/session/${sessionId}`, {
      headers: {
        'Authorization': `Bearer ${DEVIN_API_KEY}`
      }
    });
    logExternalResponse(extRequestId, response.status, null, JSON.stringify(response.data).length);

    const sessionData = response.data;
    console.log(`📡 [${requestId}] Devin fix API response - status: ${sessionData.status}, status_enum: ${sessionData.status_enum}`);
    
    let analysisStatus = 'Starting implementation';
    let implementationStatus = 'Initializing';
    let progressPercentage = 0;
    let isComplete = false;
    let finished = false;
    let prLink = '';

    // Extract fix progress from structured_output if available
    console.log(`🔍 [${requestId}] Raw structured_output exists:`, !!sessionData.structured_output);
    console.log(`🔍 [${requestId}] Raw structured_output:`, JSON.stringify(sessionData.structured_output, null, 2));
    
    if (sessionData.structured_output && typeof sessionData.structured_output === 'object') {
      console.log(`🎯 [${requestId}] Found structured output:`, sessionData.structured_output);
      analysisStatus = sessionData.structured_output.analysis_status || analysisStatus;
      implementationStatus = sessionData.structured_output.implementation_status || implementationStatus;
      progressPercentage = sessionData.structured_output.progress_percentage || 0;
      finished = sessionData.structured_output.finished || false;
      prLink = sessionData.structured_output.PR_link || '';
      console.log(`🔍 [${requestId}] Extracted values: progress=${progressPercentage}%, finished=${finished}, prLink=${prLink}`);
    } else {
      console.log(`📝 [${requestId}] No structured output available yet`);
      console.log(`📝 [${requestId}] Type of structured_output: ${typeof sessionData.structured_output}`);
      console.log(`📝 [${requestId}] All sessionData keys: [${Object.keys(sessionData).join(', ')}]`);
    }

    // Check if session is complete
    if (sessionData.status_enum === 'completed' || finished) {
      isComplete = true;
      finished = true;
      if (progressPercentage === 0) progressPercentage = 100;
      console.log(`✅ [${requestId}] Fix session is complete (status_enum: ${sessionData.status_enum}, finished: ${finished})`);
    } else if (sessionData.status_enum === 'blocked' || sessionData.status_enum === 'failed') {
      isComplete = true;
      console.log(`⚠️ [${requestId}] Fix session ended with status: ${sessionData.status_enum}`);
    } else {
      console.log(`⏳ [${requestId}] Fix session still running (status_enum: ${sessionData.status_enum})`);
    }

    // Update stored session
    storedSession.status = sessionData.status;
    storedSession.analysisStatus = analysisStatus;
    console.log(`💾 [${requestId}] Updated stored fix session data`);

    // Log message count if available
    if (sessionData.messages && Array.isArray(sessionData.messages)) {
      console.log(`💬 [${requestId}] Fix session has ${sessionData.messages.length} messages`);
    }

    const responseData = {
      sessionId,
      status: sessionData.status,
      analysisStatus,
      implementationStatus,
      progressPercentage,
      isComplete,
      finished,
      prLink,
      // Raw Devin session data for display
      devinSession: {
        session_id: sessionData.session_id,
        status: sessionData.status,
        title: sessionData.title,
        created_at: sessionData.created_at,
        updated_at: sessionData.updated_at,
        status_enum: sessionData.status_enum,
        structured_output: sessionData.structured_output,
        messages: sessionData.messages || []
      }
    };

    console.log(`✅ [${requestId}] Fix polling successful - progress: ${progressPercentage}%, complete: ${isComplete}, PR: ${prLink || 'None'}`);
    logResponse(requestId, 200, { ...responseData, devinSession: { messageCount: responseData.devinSession.messages.length } });
    res.json(responseData);
  } catch (error: any) {
    console.log(`❌ [${requestId}] Failed to poll Devin fix session:`, error.response?.data || error.message);
    if (error.response) {
      console.log(`📄 [${requestId}] Fix poll error status: ${error.response.status}`);
      if (error.response.data) {
        console.log(`📄 [${requestId}] Fix poll error data:`, error.response.data);
      }
    }
    logResponse(requestId, 500, null, error);
    res.status(500).json({ error: 'Failed to poll fix session status' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const requestId = logRequest(req, 'GET', '/health');
  const responseData = { 
    status: 'ok', 
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    activeSessions: devinSessions.size,
    githubConfigured: !!githubConfig
  };
  
  console.log(`🏥 [${requestId}] Health check - uptime: ${Math.floor(process.uptime())}s, memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
  console.log(`📊 [${requestId}] System status - GitHub: ${githubConfig ? 'configured' : 'not configured'}, Active sessions: ${devinSessions.size}`);
  
  logResponse(requestId, 200, responseData);
  res.json(responseData);
});

// 404 handler
app.use((req, res, next) => {
  const requestId = logRequest(req, req.method, req.originalUrl);
  const error = `Route not found: ${req.method} ${req.originalUrl}`;
  console.log(`❌ [${requestId}] ${error}`);
  logResponse(requestId, 404, null, new Error(error));
  res.status(404).json({ 
    error: 'Route not found',
    method: req.method,
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const requestId = (req as any).requestId || Math.random().toString(36).substring(7);
  const timestamp = new Date().toISOString();
  
  console.log(`\n💥 [${timestamp}] [${requestId}] UNHANDLED ERROR:`);
  console.log(`📍 [${requestId}] Route: ${req.method} ${req.originalUrl}`);
  console.log(`❌ [${requestId}] Error name: ${error.name || 'Unknown'}`);
  console.log(`❌ [${requestId}] Error message: ${error.message || 'No message'}`);
  
  if (error.stack) {
    console.log(`📚 [${requestId}] Stack trace:`);
    console.log(error.stack);
  }
  
  logResponse(requestId, 500, null, error);
  
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    timestamp,
    requestId
  });
});

export default app;