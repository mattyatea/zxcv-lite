<template>
  <div class="container-lg py-8">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8">{{ t('pages.privacy.title') }}</h1>
      
      <div class="prose prose-gray dark:prose-invert max-w-none">
        <h2>{{ t('pages.privacy.dataCollection') }}</h2>
        <p>{{ t('pages.privacy.dataCollectionText') }}</p>
        
        <h2>{{ t('pages.privacy.dataUsage') }}</h2>
        <p>{{ t('pages.privacy.dataUsageText') }}</p>
        
        <h2>{{ t('pages.privacy.dataProtection') }}</h2>
        <p>{{ t('pages.privacy.dataProtectionText') }}</p>
        
        <h2>{{ t('pages.privacy.userRights') }}</h2>
        <p>{{ t('pages.privacy.userRightsText') }}</p>
        
        <h2>{{ t('pages.privacy.contact') }}</h2>
        <p>{{ t('pages.privacy.contactText') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
const { t } = useI18n();

// Set page meta
useHead({
  title: t('pages.privacy.title'),
  meta: [
    { name: 'description', content: t('pages.privacy.description') }
  ]
});
</script>