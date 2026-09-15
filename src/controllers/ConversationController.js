const conversationService = require("../services/ConversationService");
const buildResponse = require("../utils/response");
const logger = require("../utils/logger");
const SocketEvents = require("../constants/SocketEvents");

async function create(req, res) {
  try {
    const result = await conversationService.createDirect(req.user.userId, req.body);
    return res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("Create conversation error", { error: error.message, stack: error.stack });
    return res.status(500).json(buildResponse(500, "Internal Server Error"));
  }
}

async function list(req, res) {
  try {
    const result = await conversationService.list(req.user.userId, req.query);
    return res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("List conversations error", { error: error.message, stack: error.stack });
    return res.status(500).json(buildResponse(500, "Internal Server Error"));
  }
}

async function remove(req, res) {
  try {
    const result = await conversationService.removeForUser(req.user.userId, req.params.conversationId);
    if (result.responseCode === 200 && Array.isArray(result.notifyUserIds)) {
      const io = req.app.get("io");
      if (io) {
        result.notifyUserIds.forEach(userId => io.to(`user:${userId}`).emit(
          SocketEvents.CONVERSATION_DELETED,
          { conversationId: req.params.conversationId }
        ));
      }
      delete result.notifyUserIds;
    }
    return res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error("Delete conversation error", { userId: req.user?.userId, conversationId: req.params.conversationId, error: error.message });
    return res.status(500).json(buildResponse(500, "Internal Server Error"));
  }
}

function emitGroupUpdate(req, result, event) {
  if (result.responseCode >= 300 || !Array.isArray(result.notifyUserIds)) return;
  const io = req.app.get("io");
  if (io) result.notifyUserIds.forEach(userId => io.to(`user:${userId}`).emit(event, {
    conversationId: req.params.conversationId || String(result.responseBody?.conversationId || ""),
    groupVersion: result.responseBody?.groupVersion || null,
    encryptionEpoch: result.responseBody?.encryptionEpoch || null
  }));
  delete result.notifyUserIds;
}

const groupAction = (serviceMethod, event, errorLabel) => async (req, res) => {
  try {
    const result = await serviceMethod(req.user.userId, req.params.conversationId, req.body, req.params.userId);
    emitGroupUpdate(req, result, event);
    return res.status(result.responseCode).json(result);
  } catch (error) {
    logger.error(errorLabel, { error: error.message, userId: req.user?.userId, conversationId: req.params.conversationId });
    return res.status(500).json(buildResponse(500, "Internal Server Error"));
  }
};

const createGroup = groupAction(
  (userId, _conversationId, body) => conversationService.createGroup(userId, body),
  SocketEvents.GROUP_CREATED,
  "Create group error"
);
const getGroup = groupAction((userId, conversationId) => conversationService.getGroup(userId, conversationId), SocketEvents.GROUP_UPDATED, "Get group error");
const updateGroup = groupAction((userId, conversationId, body) => conversationService.updateGroup(userId, conversationId, body), SocketEvents.GROUP_UPDATED, "Update group error");
const addGroupMember = groupAction((userId, conversationId, body) => conversationService.addGroupMember(userId, conversationId, body), SocketEvents.GROUP_MEMBERSHIP_UPDATED, "Add group member error");
const removeGroupMember = groupAction((userId, conversationId, _body, memberUserId) => conversationService.removeGroupMember(userId, conversationId, memberUserId), SocketEvents.GROUP_MEMBERSHIP_UPDATED, "Remove group member error");
const promoteGroupMember = groupAction((userId, conversationId, _body, memberUserId) => conversationService.setGroupAdmin(userId, conversationId, memberUserId, true), SocketEvents.GROUP_MEMBERSHIP_UPDATED, "Promote group member error");
const demoteGroupMember = groupAction((userId, conversationId, _body, memberUserId) => conversationService.setGroupAdmin(userId, conversationId, memberUserId, false), SocketEvents.GROUP_MEMBERSHIP_UPDATED, "Demote group member error");
const leaveGroup = groupAction((userId, conversationId) => conversationService.leaveGroup(userId, conversationId), SocketEvents.GROUP_MEMBERSHIP_UPDATED, "Leave group error");

module.exports = { create, list, remove, createGroup, getGroup, updateGroup, addGroupMember, removeGroupMember, promoteGroupMember, demoteGroupMember, leaveGroup };
