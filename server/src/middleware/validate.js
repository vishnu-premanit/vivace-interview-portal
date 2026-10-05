'use strict';
const { HttpError } = require('../utils/httpError');

/** Validate req[part] with a zod schema and replace it with the parsed value. */
function validate(schema, part = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[part] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return next(new HttpError(400, details[0] ? `${details[0].path ? details[0].path + ': ' : ''}${details[0].message}` : 'Invalid request', details));
    }
    if (part === 'query') req.validQuery = result.data;
    else req[part] = result.data;
    next();
  };
}

module.exports = { validate };
