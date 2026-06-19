import prisma from "../../prisma/index.js";
import { emitNotification } from "../config/socket.js";
import { nowWIB } from "../utils/dateWIB.js";

// buat notifikasi
const createNotification = async ({ userId, tipe, judul, pesan }) => {
    //save to db
    const notification = await prisma.notification.create({
        data: {
            userId,
            tipe,
            judul,
            pesan,
            createdAt: nowWIB(),
        },
    });

    // kirim ke user via socket.io room
    emitNotification(userId, notification);
    return notification;

};

// buat notifikasi ke banyak user (untuk andon call and resolve)
const createBulkNotifications = async (userIds, tipe, judul, pesan) => {
    const results = [];

    for (const userId of userIds) {
        const notif = await createNotification({
            userId: userId,
            tipe,
            judul,
            pesan,
        });

        results.push(notif);
    }

    return results;
};

// ambil daftar notifikasi milik user (paginated)

const getNotifications = async (userId, { page = 1, limit = 20 }) => {
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [data, totalItems] = await Promise.all([
        prisma.notification.findMany({
            where: { userId: userId },
            orderBy: { createdAt: "desc" },
            skip,
            take,
        }),
        prisma.notification.count({
            where: { userId: userId },
        }),
    ]);

    return {
        data,
        meta: {
            totalItems,
            totalPages: Math.ceil(totalItems / take),
            currentPage: Number(page),
        },
    };
};

//tandai sudah dibaca
const markAsRead = async (id, userId) => {
    return prisma.notification.updateMany({
        where: { id: Number(id), userId: userId },
        data: { isRead: true },
    });
};

const getUnreadCount = async (userId) => {
    const count = await prisma.notification.count({
        where: { userId: userId, isRead: false },
    });
    return { unreadCount: count };
};

export default {
    createNotification,
    createBulkNotifications,
    getNotifications,
    markAsRead,
    getUnreadCount,
}

