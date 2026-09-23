<script setup lang="ts">
import type { AccordionContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { AccordionContent, useForwardProps } from 'reka-ui'
import { cn } from '~/lib/utils'

const props = defineProps<AccordionContentProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <AccordionContent
    data-slot="accordion-content"
    v-bind="forwardedProps"
    class="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm"
  >
    <div :class="cn('pt-0 pb-2', props.class)">
      <slot />
    </div>
  </AccordionContent>
</template>
