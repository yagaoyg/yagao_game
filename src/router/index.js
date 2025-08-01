import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/Home/index.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: HomeView,
    },
  ],
})

export default router
