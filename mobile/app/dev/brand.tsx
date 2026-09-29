import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ROLE } from "../../lib/brand/shared";
import { SPECIMEN, SPECIMEN_HEIGHT, SPECIMEN_WIDTH, type SpecimenItem } from "../../lib/brand/specimen";
import { Icon } from "../../components/brand/icon";
import { PixelFrame } from "../../components/brand/pixel-frame";
import { Robin } from "../../components/brand/robin";
import { Text } from "../../components/brand/text";

/**
 * Development builds only (the root layout guards it with __DEV__): every
 * brand primitive at the fixed places of lib/brand/specimen.ts, the same list
 * the web parity harness draws with the web's CSS, so captures of the two can
 * be compared element for element. Open with `budgts://dev/brand`.
 */
export default function BrandSpecimenScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: ROLE.bg }} edges={["top"]}>
      <ScrollView>
        <View testID="specimen" style={{ width: SPECIMEN_WIDTH, height: SPECIMEN_HEIGHT, alignSelf: "center" }}>
          {SPECIMEN.map((item) => (
            <Place key={item.id} item={item} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Place({ item }: { item: SpecimenItem }) {
  const at = { position: "absolute" as const, left: item.x, top: item.y };
  switch (item.kind) {
    case "frame":
      return <PixelFrame testID={item.id} frame={item.frame} state={item.state} raise={item.raise} style={[at, { width: item.w, height: item.h }]} />;
    case "robin":
      return (
        <View style={at}>
          <Robin testID={item.id} mood={item.mood} scale={item.scale} />
        </View>
      );
    case "icon":
      return (
        <View style={at}>
          <Icon testID={item.id} name={item.name} size={item.size} />
        </View>
      );
    case "text":
      return (
        <Text testID={item.id} variant={item.role} style={[at, { width: item.w }]}>
          {item.text}
        </Text>
      );
  }
}
