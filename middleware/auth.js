module.exports = (req, res, next) => {
  if (req.session && req.session.userId) return next();
  req.flash('error', 'Please log in to access the dashboard.');
  res.redirect('/login');
};
