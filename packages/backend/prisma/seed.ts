import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to run dev seed in production (NODE_ENV=production). ' +
        'This seed creates a known dev user with a hardcoded password.',
    );
  }
  const hash = await bcrypt.hash('password123', 12);
  await prisma.user.upsert({
    where: { id: DEV_USER_ID },
    update: {},
    create: {
      id: DEV_USER_ID,
      email: 'dev@ramsey.local',
      name: 'Dev User',
      passwordHash: hash,
    },
  });
  console.log('Seeded dev user:', DEV_USER_ID);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
