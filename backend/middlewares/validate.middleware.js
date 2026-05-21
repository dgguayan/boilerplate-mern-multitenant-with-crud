import * as apiResponse from '../utils/apiResponse.js';

// Usage: validate(schema) — schema is a Joi object schema
const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    const errors = error.details.map((d) => d.message.replace(/"/g, "'"));
    return apiResponse.error(res, 'Validation failed', 422, errors);
  }
  next();
};

export default validate;
