import Joi from 'joi';

const triggerHardware = {
    body: Joi.object({
        targetId: Joi.string().required(),
        task: Joi.string().required(),
        cmd: Joi.string().required(),
    }),
};

export default {
  triggerHardware,
};

