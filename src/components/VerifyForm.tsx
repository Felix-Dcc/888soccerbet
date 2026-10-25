/** Verification-code lookup; a plain GET form, so it works before any script loads. */
export function VerifyForm({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <form action="/verify" method="get" className="card flex gap-2 p-3">
      <label htmlFor="verify-code" className="sr-only">
        Verification code
      </label>
      <input
        id="verify-code"
        name="code"
        defaultValue={defaultValue}
        required
        maxLength={40}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        placeholder="e.g. KB7QH3MZ2C9XPA4D"
        className="input min-w-0 flex-1 font-mono uppercase tracking-wider"
      />
      <button className="btn-lime px-4 text-sm">Verify</button>
    </form>
  );
}
