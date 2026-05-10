import torch
from model import FraudNet

model = FraudNet()
optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
loss_fn = torch.nn.BCELoss()

def train_step(features, label):
    x = torch.tensor([features], dtype=torch.float32)
    y = torch.tensor([[label]], dtype=torch.float32)

    pred = model(x)
    loss = loss_fn(pred, y)

    optimizer.zero_grad()
    loss.backward()
    optimizer.step()

    return float(loss.item())