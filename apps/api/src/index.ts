import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import healthRoutes from './routes/health.js';
import assignmentRoutes from './routes/assignments.js';
import scheduleRoutes from './routes/schedule.js';
import courseRoutes from './routes/courses.js';
import fileRoutes from './routes/files.js';
import scraperRoutes from './routes/scraper.js';
import tutorRoutes from './routes/tutors.js';

async function main(): Promise<void> {
  const fastify = Fastify({
    logger: {
      level: 'info',
    },
  });

  // Register CORS
  await fastify.register(cors, {
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(','),
    credentials: true,
  });

  // Register route plugins under /api prefix
  // Health check does NOT require auth
  await fastify.register(healthRoutes, { prefix: '/api' });

  // All other routes require auth (applied inside each plugin)
  await fastify.register(assignmentRoutes, { prefix: '/api' });
  await fastify.register(scheduleRoutes, { prefix: '/api' });
  await fastify.register(courseRoutes, { prefix: '/api' });
  await fastify.register(fileRoutes, { prefix: '/api' });
  await fastify.register(scraperRoutes, { prefix: '/api' });
  await fastify.register(tutorRoutes, { prefix: '/api' });

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      fastify.log.info(`Received ${signal}, shutting down...`);
      await fastify.close();
      process.exit(0);
    });
  }

  // Start server
  try {
    await fastify.listen({ port: config.API_PORT, host: '0.0.0.0' });
    fastify.log.info(`Server listening on http://0.0.0.0:${config.API_PORT}`);
  } catch (err) {
    fastify.log.error(err, 'Failed to start server');
    process.exit(1);
  }
}

main();
