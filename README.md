# Devin Challenge - Task Manager Assessment

## Overview

This project demonstrates the capabilities of Devin, an AI software engineer, through a practical task manager application. The assessment showcases how Devin can analyze, plan, and fix real-world development issues autonomously.

## Demo Video

📹 **[Watch the full Devin demo here](https://www.loom.com/share/f474870f621941ae998c2278c65e334d)**

## Related Repository

🔗 **[Task Manager Application (Fixed by Devin)](https://github.com/RafaPatino01/simple-todo-list)**  
The actual task manager application that was analyzed and fixed by Devin during the assessment.

## Project Structure

```
├── backend/          # Node.js/Express API server
│   ├── src/
│   │   ├── app.ts    # Main application logic
│   │   └── server.ts # Server configuration
│   └── package.json
├── frontend/         # React/TypeScript UI
│   ├── src/
│   │   ├── App.tsx
│   │   ├── DevinFixModal.tsx
│   │   └── ...
│   └── package.json
└── README.md
```

## The Challenge

The task manager had a bug where the "Add New Task" modal was pre-filled with data from the last edited task instead of being blank. This is a common React component reuse issue.

## Devin's Solution Process

1. **Analysis**: Devin analyzed the issue with 95% confidence
2. **Planning**: Created a detailed implementation plan
3. **Explanation**: Provided voice explanation of the root cause
4. **Implementation**: Fixed the issue by properly resetting form data in the `handleClose` function
5. **Pull Request**: Automatically created a GitHub PR with the fix

## Key Features Demonstrated

- ✅ Autonomous issue analysis and planning
- ✅ Voice interface for explanations
- ✅ Live coding session
- ✅ Automatic GitHub integration
- ✅ Pull request creation with documentation

## Running the Project

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Assessment Results

This project successfully demonstrates Devin's ability to:
- Understand complex development issues
- Create confident, actionable plans
- Implement fixes autonomously
- Integrate with development workflows

---

*This assessment showcases the future of AI-assisted software development.*