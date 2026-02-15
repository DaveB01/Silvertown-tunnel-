import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create admin user
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@infratec.co.uk' },
    update: {},
    create: {
      email: 'admin@infratec.co.uk',
      passwordHash: hashedPassword,
      firstName: 'System',
      lastName: 'Admin',
      displayName: 'System Admin',
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log('Created admin user:', admin.email);

  // Create a test engineer
  const engineerPassword = await bcrypt.hash('engineer123', 10);

  const engineer = await prisma.user.upsert({
    where: { email: 'engineer@infratec.co.uk' },
    update: {},
    create: {
      email: 'engineer@infratec.co.uk',
      passwordHash: engineerPassword,
      firstName: 'Test',
      lastName: 'Engineer',
      displayName: 'Test Engineer',
      role: 'ENGINEER',
      isActive: true,
    },
  });

  console.log('Created engineer user:', engineer.email);

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
