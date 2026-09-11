-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PRO');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('INCOMPLETE', 'ACTIVE', 'CANCEL_SCHEDULED', 'CANCELED', 'PAST_DUE');

-- CreateEnum
CREATE TYPE "CancellationReason" AS ENUM ('TOO_EXPENSIVE', 'MISSING_FEATURES', 'SWITCHING_PROVIDER', 'NOT_USING_ENOUGH', 'TEMPORARY_PAUSE', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentEventType" AS ENUM ('INITIATION', 'VERIFICATION', 'FULFILLMENT', 'FAILURE');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('FLUTTERWAVE');

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "PlanTier" NOT NULL DEFAULT 'FREE',
    "interval" "BillingInterval",
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancellationReason" "CancellationReason",
    "cancellationReasonOther" TEXT,
    "pendingInterval" "BillingInterval",
    "pendingEffectiveAt" TIMESTAMP(3),
    "flutterwaveCustomerEmail" TEXT NOT NULL,
    "flutterwaveSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "eventType" "PaymentEventType" NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'FLUTTERWAVE',
    "providerReference" TEXT NOT NULL,
    "providerEventId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_flutterwaveSubscriptionId_key" ON "Subscription"("flutterwaveSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_flutterwaveCustomerEmail_idx" ON "Subscription"("flutterwaveCustomerEmail");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_providerEventId_key" ON "PaymentEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "PaymentEvent_userId_idx" ON "PaymentEvent"("userId");

-- CreateIndex
CREATE INDEX "PaymentEvent_provider_providerReference_idx" ON "PaymentEvent"("provider", "providerReference");

-- CreateIndex
CREATE INDEX "RateLimitBucket_key_windowStart_idx" ON "RateLimitBucket"("key", "windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitBucket_key_windowStart_key" ON "RateLimitBucket"("key", "windowStart");

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
