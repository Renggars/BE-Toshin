import Joi from "joi";

const sendAnnouncement = {
  body: Joi.object().keys({
    operatorId: Joi.number().integer().required(),
    pesan: Joi.string().required(),
  }),
};

const sendBroadcast = {
  body: Joi.object().keys({
    pesan: Joi.string().required(),
  }),
};

const markRead = {
  params: Joi.object().keys({
    id: Joi.number().required(),
  }),
};

const updateAnnouncement = {
  params: Joi.object().keys({
    id: Joi.number().required(),
  }),
  body: Joi.object().keys({
    pesan: Joi.string().required(),
  }),
};

const deleteAnnouncement = {
  params: Joi.object().keys({
    id: Joi.number().required(),
  }),
};

const updateBroadcast = {
  params: Joi.object().keys({
    broadcastId: Joi.string().uuid().required(),
  }),
  body: Joi.object().keys({
    pesan: Joi.string().required(),
  }),
};

const deleteBroadcast = {
  params: Joi.object().keys({
    broadcastId: Joi.string().uuid().required(),
  }),
};

export default {
  sendAnnouncement,
  sendBroadcast,
  markRead,
  updateAnnouncement,
  deleteAnnouncement,
  updateBroadcast,
  deleteBroadcast,
};
