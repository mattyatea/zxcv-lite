<template>
  <div class="min-h-screen bg-slate-50 dark:bg-gray-950">
    <div class="container mx-auto px-4 py-10">
      <div class="max-w-5xl mx-auto space-y-8">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
              {{ t("profile.title") }}
            </h1>
            <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {{ t("profile.subtitle") }}
            </p>
          </div>
          <CommonButton
            v-if="profile"
            :tag="NuxtLink"
            :to="`/user/${profile.username}`"
            variant="secondary"
            class="self-start sm:self-auto"
          >
            {{ t("profile.labels.viewPublic") }}
          </CommonButton>
        </div>

        <CommonCard v-if="loading" padding="xl" class="flex items-center justify-center min-h-[260px]">
          <CommonLoadingSpinner size="lg" :text="t('common.loading')" />
        </CommonCard>

        <CommonCard v-else-if="error" padding="lg">
          <div class="text-center">
            <p class="text-base font-semibold text-gray-900 dark:text-white">{{ error }}</p>
            <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">{{ t("profile.errorHint") }}</p>
          </div>
        </CommonCard>

        <div v-else-if="profile" class="space-y-6">
          <CommonCard padding="lg">
            <div class="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
                <Avatar
                  :src="profile.avatarUrl"
                  :name="displayName"
                  :alt="`${profile.username}'s avatar`"
                  size="2xl"
                  shape="circle"
                  :use-gradient="true"
                />
                <div>
                  <p class="text-2xl font-semibold text-gray-900 dark:text-white">
                    {{ displayName }}
                  </p>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    @{{ profile.username }}
                  </p>
                  <div class="mt-3 flex flex-wrap items-center gap-2">
                    <CommonBadge :variant="profile.emailVerified ? 'success' : 'warning'">
                      {{
                        profile.emailVerified
                          ? t("profile.labels.emailVerified")
                          : t("profile.labels.emailUnverified")
                      }}
                    </CommonBadge>
                    <CommonBadge variant="gray">
                      {{ profile.role }}
                    </CommonBadge>
                  </div>
                </div>
              </div>
              <div class="flex flex-col gap-2 text-sm text-gray-600 dark:text-gray-400">
                <div class="flex items-center gap-2">
                  <Icon name="heroicons:envelope" class="h-4 w-4" />
                  <span>{{ profile.email }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <Icon name="heroicons:calendar" class="h-4 w-4" />
                  <span>{{ t("profile.labels.createdAt") }}: {{ formatTimestamp(profile.createdAt) }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <Icon name="heroicons:arrow-path" class="h-4 w-4" />
                  <span>{{ t("profile.labels.updatedAt") }}: {{ formatTimestamp(profile.updatedAt) }}</span>
                </div>
              </div>
            </div>
          </CommonCard>

          <div class="grid gap-6 lg:grid-cols-3">
            <CommonCard padding="lg" class="lg:col-span-2">
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                {{ t("profile.sections.details") }}
              </h2>
              <div class="mt-4 space-y-4 text-sm">
                <div>
                  <p class="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {{ t("profile.labels.bio") }}
                  </p>
                  <p class="mt-1 text-gray-700 dark:text-gray-300 whitespace-pre-line">
                    {{ profile.bio || t("profile.empty.bio") }}
                  </p>
                </div>
                <div class="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p class="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      {{ t("profile.labels.location") }}
                    </p>
                    <p class="mt-1 text-gray-700 dark:text-gray-300">
                      {{ profile.location || t("profile.empty.location") }}
                    </p>
                  </div>
                  <div>
                    <p class="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      {{ t("profile.labels.website") }}
                    </p>
                    <div class="mt-1">
                      <a
                        v-if="profile.website"
                        :href="profile.website"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-primary-600 dark:text-primary-400 hover:underline"
                      >
                        {{ profile.website }}
                      </a>
                      <span v-else class="text-gray-500 dark:text-gray-400">
                        {{ t("profile.empty.website") }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CommonCard>

            <CommonCard padding="lg">
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                {{ t("profile.sections.stats") }}
              </h2>
              <div class="mt-4 space-y-4">
                <div class="rounded-lg bg-primary-50 dark:bg-primary-950/30 p-4">
                  <p class="text-sm text-primary-700 dark:text-primary-200">
                    {{ t("profile.labels.rulesCount") }}
                  </p>
                  <p class="mt-2 text-3xl font-semibold text-primary-800 dark:text-primary-100">
                    {{ formatNumber(profile.stats.rulesCount) }}
                  </p>
                </div>
                <div class="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-4">
                  <p class="text-sm text-amber-700 dark:text-amber-200">
                    {{ t("profile.labels.totalStars") }}
                  </p>
                  <p class="mt-2 text-3xl font-semibold text-amber-800 dark:text-amber-100">
                    {{ formatNumber(profile.stats.totalStars ?? 0) }}
                  </p>
                </div>
              </div>
            </CommonCard>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { InferContractRouterOutputs } from "@orpc/contract";
import type { contract } from "~/server/orpc/contracts";
import Avatar from "~/components/common/Avatar.vue";

type Outputs = InferContractRouterOutputs<typeof contract>;
type MeProfile = Outputs["users"]["me"];

definePageMeta({
	middleware: "auth",
});

const { t, formatDate, formatNumber } = useI18n();
const $rpc = useRpc();

const profile = ref<MeProfile | null>(null);
const loading = ref(true);
const error = ref("");

const displayName = computed(() => {
	if (!profile.value) {
		return "";
	}
	return profile.value.displayName || profile.value.username;
});

const formatTimestamp = (timestamp: number) => {
	return formatDate(timestamp * 1000, "long");
};

const fetchProfile = async () => {
	loading.value = true;
	error.value = "";

	try {
		profile.value = await $rpc.users.me();
	} catch (err) {
		const message =
			err && typeof err === "object" && "message" in err
				? (err as { message?: string }).message
				: undefined;
		error.value = message || t("profile.error");
	} finally {
		loading.value = false;
	}
};

useHead({
	title: () => `${t("profile.title")} - zxcv`,
});

onMounted(() => {
	fetchProfile();
});
</script>
