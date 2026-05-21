'use strict';

/**
 * Bind for local dev; if the port is taken, try the next few ports instead of crashing.
 */
function listenWithPortFallback(app, basePort, maxAttempts = 20) {
  let port = basePort;
  const maxPort = basePort + maxAttempts - 1;

  function attempt() {
    const server = app.listen(port, () => {
      console.log(`Server listening at http://localhost:${port}`);
    });

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE' && port < maxPort) {
        console.warn(`Port ${port} is in use; trying ${port + 1}…`);
        port += 1;
        attempt();
      } else {
        console.error(
          err.code === 'EADDRINUSE'
            ? `No free port between ${basePort} and ${maxPort}. Stop other servers or set PORT.`
            : err.message
        );
        process.exit(1);
      }
    });
  }

  attempt();
}

module.exports = { listenWithPortFallback };
