// 🔒 Unique symbol for context
export const REGISTRY = Symbol("ui-component-registry");

export type Registry = {
  Button: typeof import("../components/ui/button/button.svelte").default;
  Card: typeof import("../components/ui/card/card.svelte").default;
  Separator: typeof import("../components/ui/separator/separator.svelte").default;
  Textarea: typeof import("../components/ui/textarea/textarea.svelte").default;
  Avatar: typeof import("../components/ui/avatar/avatar.svelte").default;
  AvatarImage: typeof import("../components/ui/avatar/avatar-image.svelte").default;
  AvatarFallback: typeof import("../components/ui/avatar/avatar-fallback.svelte").default;
  Input: typeof import("../components/ui/input/input.svelte").default;
  Tabs: typeof import("../components/ui/tabs/tabs-list.svelte").default;
  TabsList: typeof import("../components/ui/tabs/tabs-list.svelte").default;
  TabsTrigger: typeof import("../components/ui/tabs/tabs-trigger.svelte").default;
  TabsContent: typeof import("../components/ui/tabs/tabs-content.svelte").default;
  // Add more widgets as needed
};

import Button from "../components/ui/button/button.svelte";
import Card from "../components/ui/card/card.svelte";
import Separator from "../components/ui/separator/separator.svelte";
import Textarea from "../components/ui/textarea/textarea.svelte";
import Avatar from "../components/ui/avatar/avatar.svelte";
import AvatarImage from "../components/ui/avatar/avatar-image.svelte";
import AvatarFallback from "../components/ui/avatar/avatar-fallback.svelte";
import Input from "../components/ui/input/input.svelte";
import Tabs from "../components/ui/tabs/tabs-list.svelte";
import TabsList from "../components/ui/tabs/tabs-list.svelte";
import TabsTrigger from "../components/ui/tabs/tabs-trigger.svelte";
import TabsContent from "../components/ui/tabs/tabs-content.svelte";

export const defaultRegistry: Registry = {
  Button,
  Card,
  Separator,
  Textarea,
  Avatar,
  AvatarImage,
  AvatarFallback,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
};
