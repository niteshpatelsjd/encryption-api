const UserSession = require("../models/UserSession");

module.exports = {
  async createSession(data) {
    return UserSession.create(data);
  },

  async closeSessionByToken(token) {
    return UserSession.findOneAndUpdate(
      { sessionToken: token, isActive: true },
      {
        logoutAt: new Date(),
        isActive: false,
      },
      { new: true }
    );
  },
};
