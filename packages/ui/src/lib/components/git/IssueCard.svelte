    onCommentCreated,
  }: Props = $props();

  const parsed = parseIssueEvent(event);
  const {
    id,