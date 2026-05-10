class FeatureBuffer:
    def __init__(self):
        self.buffer = []

    def add(self, features, label):
        self.buffer.append((features, label))

        if len(self.buffer) > 1000:
            self.buffer.pop(0)

    def get_batch(self):
        return self.buffer