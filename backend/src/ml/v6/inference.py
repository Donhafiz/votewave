import sys
import json
import torch
from model import FraudNet

model = FraudNet()

def predict(features):
    x = torch.tensor([features], dtype=torch.float32)

    with torch.no_grad():
        score = model(x)

    return float(score.item())

if __name__ == "__main__":
    data = json.loads(sys.argv[1])

    result = predict([
        data["userRiskScore"],
        data["voteVelocity"],
        data["ipReputation"],
        data["deviceEntropy"],
        data["electionActivity"],
        data["timeDelta"]
    ])

    print(json.dumps({"fraudProbability": result}))