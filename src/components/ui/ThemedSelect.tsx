import { Children, Fragment, isValidElement, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

interface Choice { value: string; label: ReactNode; disabled: boolean; group?: string }
function choicesFrom(children: ReactNode, group?: string, inheritedDisabled = false): Choice[] {
  const choices: Choice[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean; label?: string }>(child)) return;
    if (child.type === Fragment) choices.push(...choicesFrom(child.props.children, group, inheritedDisabled));
    else if (child.type === "optgroup") choices.push(...choicesFrom(child.props.children, child.props.label, inheritedDisabled || !!child.props.disabled));
    else if (child.type === "option") choices.push({ value: String(child.props.value ?? child.props.children ?? ""), label: child.props.children, disabled: inheritedDisabled || !!child.props.disabled, group });
  });
  return choices;
}

interface ThemedSelectProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value" | "defaultValue" | "onChange" | "children" | "type" | "dir"> {
  value?: string | number;
  defaultValue?: string | number;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  placeholder?: string;
  required?: boolean;
  dir?: "ltr" | "rtl";
}

/** Native option declarations remain data; both trigger and popup are themed. */
export function ThemedSelect({ value, defaultValue, onValueChange, children, className = "", placeholder = "Choose an option", name, required, disabled, dir, form, id, onPointerDown, onKeyDown, ...buttonProps }: ThemedSelectProps) {
  const generatedId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement>();
  const [input, setInput] = useState<"pointer" | "keyboard">("keyboard");
  const choices = choicesFrom(children);
  let empty = "__yomikura_empty_choice__";
  while (choices.some((choice) => choice.value === empty)) empty += "_";
  const encode = (candidate: string) => candidate === "" ? empty : candidate;
  const [uncontrolled, setUncontrolled] = useState(String(defaultValue ?? choices[0]?.value ?? ""));
  const current = String(value ?? uncontrolled);
  const label = choices.find((choice) => choice.value === current)?.label ?? placeholder;
  const triggerId = id ?? `select-${generatedId}`;

  return <Select.Root value={encode(current)} onValueChange={(next) => {
    const decoded = next === empty ? "" : next;
    setUncontrolled(decoded);
    if (decoded !== current) onValueChange?.(decoded);
  }} onOpenChange={(open) => {
    if (open) setPortalContainer(trigger.current?.closest<HTMLElement>('[aria-modal="true"]') ?? undefined);
  }} disabled={disabled || !choices.length} required={required} name={name} form={form} dir={dir}>
    <Select.Trigger {...buttonProps} id={triggerId} ref={trigger} data-value={current} className={`yomi-field yomi-select-trigger ${className}`} onPointerDown={(event) => { setInput("pointer"); onPointerDown?.(event); }} onKeyDown={(event) => { setInput("keyboard"); onKeyDown?.(event); }}>
      <Select.Value>{label}</Select.Value><Select.Icon className="yomi-select-chevron"><ChevronDown aria-hidden="true" /></Select.Icon>
    </Select.Trigger>
    <Select.Portal container={portalContainer}>
      <Select.Content className="yomi-select-popup" data-input={input} position="popper" sideOffset={6} collisionPadding={12} aria-label={buttonProps["aria-label"]} aria-labelledby={buttonProps["aria-label"] ? undefined : triggerId}>
        <Select.ScrollUpButton className="yomi-select-scroll"><ChevronUp aria-hidden="true" /></Select.ScrollUpButton>
        <Select.Viewport className="yomi-select-options" role="group" aria-label="Choices" tabIndex={0}>
          {choices.map((choice, index) => <Fragment key={`${choice.value}-${index}`}>
            {choice.group && choice.group !== choices[index - 1]?.group && <div className="yomi-select-group-label">{choice.group}</div>}
            <Select.Item value={encode(choice.value)} disabled={choice.disabled} className="yomi-select-option" data-value={choice.value}>
              <Select.ItemText>{choice.label}</Select.ItemText><Select.ItemIndicator><Check aria-hidden="true" /></Select.ItemIndicator>
            </Select.Item>
          </Fragment>)}
        </Select.Viewport>
        <Select.ScrollDownButton className="yomi-select-scroll"><ChevronDown aria-hidden="true" /></Select.ScrollDownButton>
      </Select.Content>
    </Select.Portal>
  </Select.Root>;
}
