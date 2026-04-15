import prisma from "../db.server";

export async function loader() {
    console.log("TESTTTT");
  try {
    await prisma.$queryRaw`SELECT 1`;

    return Response.json({
      ok: true,
      database: "connected",
    });
  } catch (error) {
    console.error("Health check failed:", error);

    return Response.json(
      {
        ok: false,
        database: "disconnected",
      },
      { status: 500 }
    );
  }
}