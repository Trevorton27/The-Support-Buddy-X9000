import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import customersData from "@/data/customers.json";
import ticketsData from "@/data/tickets.json";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Clear existing data (in dependency order)
  await prisma.agentStep.deleteMany();
  await prisma.investigationRun.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.customer.deleteMany();

  // Re-seed customers
  for (const customer of customersData) {
    await prisma.customer.upsert({
      where: { email: customer.email },
      update: {},
      create: customer,
    });
  }

  // Re-seed tickets
  for (const ticket of ticketsData) {
    await prisma.ticket.upsert({
      where: { externalId: ticket.externalId },
      update: {},
      create: ticket,
    });
  }

  return NextResponse.json({ success: true, message: "Database reset and seeded" });
}
