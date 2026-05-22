export const createVerifyToken = (auth) => async (req, res, next) => {
  try {
    const sessionResult = await auth.api.getSession({ headers: req.headers });
    const session = sessionResult?.data ?? sessionResult;

    if (!session?.user) {
      return res.status(401).send({ message: 'Unauthorized access' });
    }

    req.user = session.user;
    return next();
  } catch (error) {
    return res.status(401).send({ message: 'Unauthorized access' });
  }
};
