import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      APP_SECRET: "test-secret-test-secret-test-secret-123",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://dnd:dnd@localhost:5432/dungeonbuddy_test",
      TELEGRAM_BOT_TOKEN: "123456:TEST-TOKEN",
      TELEGRAM_BOT_USERNAME: "TestBot",
      TELEGRAM_ALLOWED_IDS: "1001,1002",
      TRUST_PROXY: "0",
    },
  },
});
