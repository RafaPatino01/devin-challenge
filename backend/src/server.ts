import app from './app';

const PORT = process.env.PORT || 3001;

console.log('\n🚀 ================================');
console.log('🚀 COGNITION CHALLENGE BACKEND');
console.log('🚀 ================================');
console.log(`📅 Starting at: ${new Date().toISOString()}`);
console.log(`🔧 Node version: ${process.version}`);
console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`💾 Memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);

// Process event handlers for better error tracking
process.on('uncaughtException', (error) => {
  console.log(`\n💥 [${new Date().toISOString()}] UNCAUGHT EXCEPTION:`);
  console.log(`❌ Error name: ${error.name}`);
  console.log(`❌ Error message: ${error.message}`);
  console.log(`📚 Stack trace:`);
  console.log(error.stack);
  console.log(`🔄 Process will exit...`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.log(`\n💥 [${new Date().toISOString()}] UNHANDLED PROMISE REJECTION:`);
  console.log(`📍 Promise:`, promise);
  console.log(`❌ Reason:`, reason);
  console.log(`⚠️ This should be handled properly in production!`);
});

process.on('SIGTERM', () => {
  console.log(`\n🛑 [${new Date().toISOString()}] SIGTERM received`);
  console.log(`🔄 Gracefully shutting down server...`);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(`\n🛑 [${new Date().toISOString()}] SIGINT received (Ctrl+C)`);
  console.log(`🔄 Gracefully shutting down server...`);
  process.exit(0);
});

const server = app.listen(PORT, () => {
  console.log(`\n✅ Server successfully started!`);
  console.log(`🌐 Port: ${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`🐙 GitHub API: http://localhost:${PORT}/api/github`);
  console.log(`🤖 Devin API: http://localhost:${PORT}/api/devin`);
  console.log(`📊 Available endpoints:`);
  console.log(`   POST /api/github/configure - Configure GitHub credentials`);
  console.log(`   GET  /api/github/repos - List user repositories`);
  console.log(`   POST /api/github/select-repo - Select a repository`);
  console.log(`   GET  /api/github/issues - Get repository issues`);
  console.log(`   POST /api/devin/confidence - Create confidence assessment`);
  console.log(`   GET  /api/devin/confidence/:id - Poll assessment status`);
  console.log(`   GET  /health - Health check\n`);
  console.log(`🎯 Ready to process requests!\n`);
});

server.on('error', (error: any) => {
  console.log(`\n💥 [${new Date().toISOString()}] SERVER ERROR:`);
  console.log(`❌ Error code: ${error.code}`);
  console.log(`❌ Error message: ${error.message}`);
  
  if (error.code === 'EADDRINUSE') {
    console.log(`🔥 Port ${PORT} is already in use!`);
    console.log(`💡 Try: lsof -ti:${PORT} | xargs kill -9`);
    console.log(`💡 Or use a different port: PORT=3002 npm run dev`);
  }
});

// Periodic memory usage logging (every 5 minutes)
setInterval(() => {
  const memUsage = process.memoryUsage();
  console.log(`\n📊 [${new Date().toISOString()}] PERIODIC HEALTH CHECK:`);
  console.log(`💾 Memory - Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
  console.log(`💾 Memory - Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`);
  console.log(`💾 Memory - RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB`);
  console.log(`⏱️ Uptime: ${Math.floor(process.uptime())}s`);
}, 5 * 60 * 1000);