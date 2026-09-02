const AdminUser = require("../models/AdminUser");


async function updatePassword (
    userId,
    password
){

    return await AdminUser.findByIdAndUpdate(

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

    return await AdminUser.findByIdAndUpdate(

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


async function findByEmail(email) {
  return AdminUser.findOne({ email: email.toLowerCase() });
}

async function updateUser(id, updateData) {
  return await AdminUser.findByIdAndUpdate(
    id,
    { ...updateData, updatedAt: new Date() },
    { new: true }
  );
}

async function createUser(userData) {
  const newUser = new AdminUser({
    ...userData,
    status: 1,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  return await newUser.save();
}

async function findByCountryCodeAndMobileNumber(countryCode,mobileNumber) {
  return await AdminUser.findOne({ countryCode: countryCode, mobileNumber: mobileNumber });
}
async function findById(id) {
  return await AdminUser.findById(id);
}

async function findAllUsers(query, skip, pageSize) {
  try {
    // Ensure skip and limit are numbers
  

    const users = await AdminUser.find(query)
      .populate({
        path: "roleId",
        populate: {
          path: "roleModuleList",
          model: "role_modules"
        }
      })
      .sort({ createdAt: -1 }) // DESC order
      .skip(skip)
      .limit(pageSize);

    return users;
  } catch (error) {
    throw new Error("Error fetching users: " + error.message);
  }
}
async function countDocuments(query){
   return await AdminUser.countDocuments(query);
}

module.exports = { createUser, findByCountryCodeAndMobileNumber,
   findById, updateUser, findAllUsers,countDocuments, updatePassword,updateLoginDetails,findByEmail  };
