const { HttpError } = require('../utils/errors');

/** validate(zodSchema) - validates & sanitises req.body, responds 422 with field errors on failure */
const validate = (schema) => (req, res, next) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw new HttpError(422, details[0] ? `${details[0].field ? details[0].field + ': ' : ''}${details[0].message}` : 'Validation failed', details);
  }
  req.body = parsed.data;
  next();
};

module.exports = { validate };
