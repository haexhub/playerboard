<script setup lang="ts">
definePageMeta({
  middleware: ['trainer-only'],
})

await navigateTo(`/t/${useRoute().params.slug}/analytics`, { replace: true })
</script>
