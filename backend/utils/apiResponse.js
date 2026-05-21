export const success = (res, data = {}, message = 'OK', status = 200) =>
  res.status(status).json({ success: true, message, data });

export const created = (res, data = {}, message = 'Created') =>
  res.status(201).json({ success: true, message, data });

export const paginated = (res, data, pagination) =>
  res.status(200).json({ success: true, data, pagination });

export const error = (res, message = 'Server error', status = 500, errors = null) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(status).json(body);
};
