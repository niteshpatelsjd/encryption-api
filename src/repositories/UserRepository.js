const User = require("../models/User");

async function updateNotificationSettings(userId, updates) {

    return User.findByIdAndUpdate(
        userId,
        {
            $set: {
                ...updates,
                updatedAt: new Date()
            }
        },
        {
            new: true
        }
    ).lean();

}
async function updatePassword (
    userId,
    password
){

    return await User.findByIdAndUpdate(

        userId,

        {
            password,
            updatedAt: new Date()
        },

        {
            new: true
        }

    );

}

async function updateLoginDetails(
    userId,
    deviceToken,
    deviceType
){

    return await User.findByIdAndUpdate(

        userId,

        {
            deviceToken,
            deviceType,
            lastLogin: new Date(),
            updatedAt: new Date()
        },

        {
            new: true
        }

    );

}
async function findById(id) {
  return User.findById(id);
}

async function findByEmail(email) {
  return User.findOne({ email: email.toLowerCase() });
}

async function findByCountryCodeAndMobileNumber(countryCode, mobileNumber) {
  return User.findOne({ countryCode, mobileNumber });
}

async function save(user) {
  return user.save();
}

async function findAllUsers(query, skip, limit) {
  return User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
}

async function countDocuments(query) {
  return User.countDocuments(query);
}

module.exports = {
  updatePassword,
  findById,
  findByEmail,
  findByCountryCodeAndMobileNumber,
  save,
  findAllUsers,
  countDocuments,
  updateLoginDetails,
  updateNotificationSettings
};
