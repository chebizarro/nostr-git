// 🔒 Unique symbol for context
export const REGISTRY = Symbol("ui-component-registry");

export type Registry = {
  Button: typeof import("../components/ui/button/button.svelte").default;
  Card: typeof import("../components/ui/card/card.svelte").default;
  CardHeader: typeof import("../components/ui/card/card-header.svelte").default;
  CardTitle: typeof import("../components/ui/card/card-title.svelte").default;
  CardContent: typeof import("../components/ui/card/card-content.svelte").default;
  Collapsible: typeof import("../components/ui/collapsible");
  CollapsibleContent: typeof import("../components/ui/collapsible");
  CollapsibleTrigger: typeof import("../components/ui/collapsible");
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
  Checkbox: typeof import("../components/ui/checkbox/checkbox.svelte").default;
  Label: typeof import("../components/ui/label/label.svelte").default;
  Alert: typeof import("../components/ui/alert/alert.svelte").default;
  AlertDescription: typeof import("../components/ui/alert/alert-description.svelte").default;
  AlertTitle: typeof import("../components/ui/alert/alert-title.svelte").default;
  Badge: typeof import("../components/ui/badge/badge.svelte").default;
  ScrollArea: typeof import("../components/ui/scroll-area/scroll-area.svelte").default;
  Progress: typeof import("../components/ui/progress/progress.svelte").default;
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
import Checkbox from "../components/ui/checkbox/checkbox.svelte";
import Label from "../components/ui/label/label.svelte";
import Alert from "../components/ui/alert/alert.svelte";
import AlertDescription from "../components/ui/alert/alert-description.svelte";
import AlertTitle from "../components/ui/alert/alert-title.svelte";
import Badge from "../components/ui/badge/badge.svelte";
import ScrollArea from "../components/ui/scroll-area/scroll-area.svelte";
import CardHeader from "../components/ui/card/card-header.svelte";
import CardTitle from "../components/ui/card/card-title.svelte";
import CardContent from "../components/ui/card/card-content.svelte";
import * as Collapsible from "../components/ui/collapsible";
import Progress from "../components/ui/progress/progress.svelte";

export const defaultRegistry: Registry = {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
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
  Checkbox,
  Label,
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  ScrollArea,
  Collapsible,
  Progress,
};
