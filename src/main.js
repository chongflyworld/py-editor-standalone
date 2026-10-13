import { createApp } from "vue";
import Antd from "ant-design-vue";
import "ant-design-vue/dist/reset.css";
import PyEditor from "./views/PyEditor.vue";

// 独立版：直接挂载编辑器，不挂整站路由 / 不接后端鉴权 / 不注册 Pinia。
const app = createApp(PyEditor);
app.use(Antd);
app.mount("#app");
