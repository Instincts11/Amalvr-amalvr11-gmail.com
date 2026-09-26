// npm start on Windows cannot use a POSIX `NODE_ENV=production` prefix.
// Set the variable here, then load the server, so Linux and Windows share one command.
process.env.NODE_ENV = 'production';
await import('../server/index.js');
