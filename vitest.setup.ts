// Runs before every test file. Stub the env vars that lib modules read at
// import-time so the test process doesn't crash on `throw new Error('DATABASE_URL not configured')`
// and so payment libs see STRIPE_MOCK=true.
process.env.STRIPE_MOCK = 'true';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_dummy';
process.env.HMU_FIRST_PRICE_ID = process.env.HMU_FIRST_PRICE_ID || 'price_test_dummy';
