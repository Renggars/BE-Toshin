import prisma from "../../prisma/index.js";

const getMesin = async () => {
  return prisma.mesin.findMany({ select: { id: true, nama_mesin: true } });
};

const getProduk = async () => {
  return prisma.produk.findMany({ select: { id: true, nama_produk: true } });
};

const getShift = async () => {
  return prisma.shift.findMany();
};

const getTarget = async (filter) => {
  // Jika mencari spesifik produk dan pekerjaan, gunakan findFirst untuk mendapatkan 1 objek saja
  if (filter.fk_produk && filter.fk_jenis_pekerjaan) {
    return prisma.target.findFirst({
      where: filter,
      //   include: {
      //     jenis_pekerjaan: true,
      //     produk: { select: { nama_produk: true } },
      //   },
    });
  }

  // Jika filter umum (hanya produk), tampilkan daftar (findMany)
  return prisma.target.findMany({
    where: filter,
    // include: {
    //   jenis_pekerjaan: true,
    //   produk: { select: { nama_produk: true } },
    // },
  });
};

const createTarget = async (data) => {
  return prisma.target.create({ data });
};

export default { getMesin, getProduk, getShift, getTarget, createTarget };
