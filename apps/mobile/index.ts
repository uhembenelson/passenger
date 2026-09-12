import { registerRootComponent } from "expo";
import { Text, TextInput } from "react-native";
import App from "./App";

// Keep Dynamic Type enabled throughout the app, including legacy raw RN text
// nodes. The cap prevents fixed navigation and control rows from collapsing.
type ScalableComponent = { defaultProps?: { allowFontScaling?: boolean; maxFontSizeMultiplier?: number } };
const scalableText = Text as unknown as ScalableComponent;
const scalableInput = TextInput as unknown as ScalableComponent;
scalableText.defaultProps = { ...scalableText.defaultProps, allowFontScaling: true, maxFontSizeMultiplier: 1.5 };
scalableInput.defaultProps = { ...scalableInput.defaultProps, allowFontScaling: true, maxFontSizeMultiplier: 1.4 };

registerRootComponent(App);
