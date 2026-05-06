export function ContentSkeleton() {
  return (
    <div class="skeleton" aria-hidden="true">
      <div class="skeleton__h1" />
      <div class="skeleton__meta" />
      <div class="skeleton__line" style={{ width: '94%' }} />
      <div class="skeleton__line" style={{ width: '88%' }} />
      <div class="skeleton__line" style={{ width: '76%' }} />
      <div class="skeleton__h2" />
      <div class="skeleton__line" style={{ width: '92%' }} />
      <div class="skeleton__line" style={{ width: '84%' }} />
      <div class="skeleton__code" />
      <div class="skeleton__line" style={{ width: '90%' }} />
      <div class="skeleton__line" style={{ width: '70%' }} />
    </div>
  );
}
