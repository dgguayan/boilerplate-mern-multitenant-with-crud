const corsOptions = {
  origin: (origin, callback) => {
    // FRONTEND_URL may be a comma-separated list of allowed origins
    const allowed = (process.env.FRONTEND_URL || '')
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean);
    // Allow requests with no origin (mobile apps, Postman, server-to-server)
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true, // Required for cookies (refresh token)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

export default corsOptions;
