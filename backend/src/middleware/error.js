const notFound = (req, res) => res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ message: err.message, details: err.details });
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A record with the same unique value already exists' });
  if (err.code === 'ER_LOCK_DEADLOCK' || err.code === 'ER_LOCK_WAIT_TIMEOUT')
    return res.status(409).json({ message: 'The request is being processed by someone else, please retry' });
  if (err.name === 'MulterError') return res.status(422).json({ message: err.message });
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
};

module.exports = { notFound, errorHandler };
