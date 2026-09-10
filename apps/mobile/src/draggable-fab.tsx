import React, { useRef } from "react";
import { Animated, PanResponder, StyleSheet } from "react-native";
import { Plus } from "lucide-react-native";

type DraggableFABProps = {
  onPress: () => void;
};

export function DraggableFAB({ onPress }: DraggableFABProps) {
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const isDragging = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4;
      },
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value,
        });
        pan.setValue({ x: 0, y: 0 });
        isDragging.current = false;
      },
      onPanResponderMove: (_, gestureState) => {
        if (Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4) {
          isDragging.current = true;
        }
        pan.x.setValue(gestureState.dx);
        pan.y.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        pan.flattenOffset();
        // If movement was negligible, treat as a tap
        if (!isDragging.current && Math.abs(gestureState.dx) <= 4 && Math.abs(gestureState.dy) <= 4) {
          onPress();
        }
      },
    })
  ).current;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        fabStyles.fab,
        {
          transform: [
            { translateX: pan.x },
            { translateY: pan.y },
          ],
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Open quick actions"
    >
      <Plus size={28} color="#FFFFFF" strokeWidth={2.5} pointerEvents="none" />
    </Animated.View>
  );
}

const fabStyles = StyleSheet.create({
  fab: {
    position: "absolute",
    bottom: 85,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 999,
  },
});
