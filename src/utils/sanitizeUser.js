const sanitizePasswordResponse = (user) => {
  if (!user) return null;
  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
};

export default sanitizePasswordResponse;
