const corsOptions = {
  origin: (origin, callback) => {
    const allowed = process.env.FRONTEND_URL;
    // Allow requests with no origin (mobile apps, Postman, server-to-server)
    if (!origin || origin === allowed) {
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
