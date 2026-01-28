/**
 * Custom validation for password
 * @param {string} value
 * @param {Object} helpers
 */
const password = (value, helpers) => {
  if (value.length < 8) {
    return helpers.error("Password minimal 8 karakter");
  }
  return value;
};

export { password };
