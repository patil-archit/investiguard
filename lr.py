
def sigmoid(z):
    if z < -500:
        return 0.0
    if z > 500:
        return 1.0
    return 1 / (1 + 2.718281828 ** (-z))

def load_data(filename):
    with open(filename, "r") as file:
        lines = file.readlines()

    # Clean quotes, whitespace, and lowercase header items
    header = [col.strip().strip("\"'").lower() for col in lines[0].strip().split(",")]

    # Identify columns (support common column naming variations)
    def find_col(candidates):
        for name in candidates:
            if name in header:
                return header.index(name)
        return -1

    sl = find_col(["sepallengthcm", "sepal.length", "sepal_length"])
    sw = find_col(["sepalwidthcm", "sepal.width", "sepal_width"])
    pl = find_col(["petallengthcm", "petal.length", "petal_length"])
    pw = find_col(["petalwidthcm", "petal.width", "petal_width"])
    target = find_col(["species", "variety", "class", "target"])

    if -1 in (sl, sw, pl, pw, target):
        raise ValueError(f"Could not map all required columns. Found header: {header}")

    X = []
    Y = []

    for line in lines[1:]:
        line = line.strip()
        if not line:
            continue

        row = [col.strip().strip("\"'") for col in line.split(",")]

        if len(row) <= max(sl, sw, pl, pw, target):
            continue

        species = row[target].strip().lower()

        if "setosa" in species:
            y = 0
        elif "versicolor" in species:
            y = 1
        else:
            continue

        features = [
            float(row[sl]),
            float(row[sw]),
            float(row[pl]),
            float(row[pw])
        ]

        X.append(features)
        Y.append(y)

    return X, Y

def split_data(X, Y):
    X_train, Y_train = [], []
    X_test, Y_test = [], []

    count = [0, 0]

    for i in range(len(X)):
        label = Y[i]

        if count[label] < 40:
            X_train.append(X[i])
            Y_train.append(Y[i])
        else:
            X_test.append(X[i])
            Y_test.append(Y[i])

        count[label] += 1

    return X_train, Y_train, X_test, Y_test

def normalize(X_train, X_test):
    n = len(X_train)
    features = len(X_train[0])

    mean = [0] * features
    std = [0] * features

    for j in range(features):
        for i in range(n):
            mean[j] += X_train[i][j]

        mean[j] /= n

        for i in range(n):
            std[j] += (X_train[i][j] - mean[j]) ** 2

        std[j] = (std[j] / n) ** 0.5

        if std[j] == 0:
            std[j] = 1

    def transform(X):
        result = []

        for row in X:
            new_row = []

            for j in range(features):
                new_row.append((row[j] - mean[j]) / std[j])

            result.append(new_row)

        return result

    return transform(X_train), transform(X_test), mean, std

def train(X, Y, alpha, iterations):
    m = len(X)
    n = len(X[0])

    w = [0.0] * n
    b = 0.0

    for iteration in range(iterations):
        dw = [0.0] * n
        db = 0.0

        for i in range(m):
            z = b

            for j in range(n):
                z += w[j] * X[i][j]

            a = sigmoid(z)
            error = a - Y[i]

            db += error

            for j in range(n):
                dw[j] += error * X[i][j]

        for j in range(n):
            w[j] -= alpha * dw[j] / m

        b -= alpha * db / m

    return w, b

def predict(x, w, b):
    z = b

    for j in range(len(w)):
        z += w[j] * x[j]

    probability = sigmoid(z)

    if probability >= 0.5:
        return 1, probability
    else:
        return 0, probability


X, Y = load_data("iris.csv")

X_train, Y_train, X_test, Y_test = split_data(X, Y)

X_train, X_test, mean, std = normalize(X_train, X_test)

alpha = 0.1
iterations = 5000

w, b = train(X_train, Y_train, alpha, iterations)

correct = 0

for i in range(len(X_test)):
    prediction, probability = predict(X_test[i], w, b)

    if prediction == Y_test[i]:
        correct += 1

accuracy = (correct / len(Y_test)) * 100

print("LOGISTIC REGRESSION RESULTS")
print("---------------------------")
print("Total Instances:", len(X))
print("Training Instances:", len(X_train))
print("Testing Instances:", len(X_test))
print("Learning Rate:", alpha)
print("Iterations:", iterations)
print("Accuracy:", round(accuracy, 2), "%")

print("\nSAMPLE PREDICTIONS")

samples = [
    [5.1, 3.5, 1.4, 0.2],
    [7.0, 3.2, 4.7, 1.4]
]

for sample in samples:
    normalized_sample = []

    for j in range(len(sample)):
        normalized_sample.append((sample[j] - mean[j]) / std[j])

    result, probability = predict(normalized_sample, w, b)

    if result == 0:
        name = "Setosa"
    else:
        name = "Versicolor"

    print("\nInput:", sample)
    print("Predicted Species:", name)
    print("Probability:", round(probability * 100, 2), "%")
