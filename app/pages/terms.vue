<template>
  <div class="container-lg py-8">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8">{{ t('pages.terms.title') }}</h1>
      
      <div class="prose prose-gray dark:prose-invert max-w-none">
        <h2>{{ t('pages.terms.acceptance') }}</h2>
        <p>{{ t('pages.terms.acceptanceText') }}</p>
        
        <h2>{{ t('pages.terms.serviceUse') }}</h2>
        <p>{{ t('pages.terms.serviceUseText') }}</p>
        
        <h2>{{ t('pages.terms.userContent') }}</h2>
        <p>{{ t('pages.terms.userContentText') }}</p>
        
        <h2>{{ t('pages.terms.intellectualProperty') }}</h2>
        <p>{{ t('pages.terms.intellectualPropertyText') }}</p>
        
        <h2>{{ t('pages.terms.prohibitedUses') }}</h2>
        <p>{{ t('pages.terms.prohibitedUsesText') }}</p>
        
        <h2>{{ t('pages.terms.liability') }}</h2>
        <p>{{ t('pages.terms.liabilityText') }}</p>
        
        <h2>{{ t('pages.terms.changes') }}</h2>
        <p>{{ t('pages.terms.changesText') }}</p>
        
        <h2>{{ t('pages.terms.contact') }}</h2>
        <p>{{ t('pages.terms.contactText') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
const { t } = useI18n();

// Set page meta
useHead({
  title: t('pages.terms.title'),
  meta: [
    { name: 'description', content: t('pages.terms.description') }
  ]
});
</script>