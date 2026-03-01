import { FlatList, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

const modes = [
  { key: 'single', title: 'Single', description: 'One-shot confetti burst' },
  {
    key: 'continuous',
    title: 'Continuous',
    description: 'Continuous falling confetti',
  },
  { key: 'pi', title: 'PI', description: 'Physics-inspired confetti' },
  { key: 'cannon', title: 'Cannon', description: 'Confetti cannons from edges' },
] as const;

export default function HomeScreen() {
  const router = useRouter();

  return (
    <FlatList
      data={modes}
      contentContainerStyle={styles.list}
      keyExtractor={(item) => item.key}
      renderItem={({ item }) => (
        <Pressable
          style={styles.card}
          onPress={() => router.push(`/${item.key}`)}
        >
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardDescription}>{item.description}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 20,
    gap: 12,
  },
  card: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: '#666',
  },
});
