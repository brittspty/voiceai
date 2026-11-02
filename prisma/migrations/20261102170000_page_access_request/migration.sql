-- CreateTable
CREATE TABLE "PageAccessRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pageKey" TEXT NOT NULL,
    "pageLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageAccessRequest_userId_pageKey_createdAt_idx" ON "PageAccessRequest"("userId", "pageKey", "createdAt");

-- AddForeignKey
ALTER TABLE "PageAccessRequest" ADD CONSTRAINT "PageAccessRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
